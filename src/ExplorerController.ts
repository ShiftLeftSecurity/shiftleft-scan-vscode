/**
This file is part of Scan.

Scan is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
Scan is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Scan.  If not, see <https://www.gnu.org/licenses/>.
*/

import * as path from "path";
import * as sarif from "sarif";
import {
  commands,
  Disposable,
  Event,
  EventEmitter,
  ExtensionContext,
  Uri,
  ViewColumn,
  WebviewPanel,
  window,
} from "vscode";
import { MessageType } from "./common/Enums";
import {
  DiagnosticData,
  ResultsListData,
  WebviewMessage,
} from "./common/Interfaces";
import { SVDiagnosticCollection } from "./SVDiagnosticCollection";
import { SarifViewerVsCodeDiagnostic } from "./SarifViewerDiagnostic";
import { FileMapper } from "./FileMapper";
import { Utilities } from "./Utilities";
import { Scan } from "./Scan";

/**
 * This class handles generating and providing the HTML content for the Explorer panel
 */
export class ExplorerController implements Disposable {
  private disposables: Disposable[] = [];

  public static readonly ExplorerLaunchCommand =
    "extension.shiftleft.LaunchExplorer";
  private static readonly ExplorerTitle = "Security Scan Results";

  public resultsListData: ResultsListData | undefined;

  // Active diagnostic and corresponding event.
  private activeSVDiagnostic: SarifViewerVsCodeDiagnostic | undefined;

  private onDidChangeActiveDiagnosticEventEmitter: EventEmitter<
    SarifViewerVsCodeDiagnostic | undefined
  > = new EventEmitter<SarifViewerVsCodeDiagnostic | undefined>();

  public get onDidChangeActiveDiagnostic(): Event<
    SarifViewerVsCodeDiagnostic | undefined
  > {
    return this.onDidChangeActiveDiagnosticEventEmitter.event;
  }

  public get activeDiagnostic(): SarifViewerVsCodeDiagnostic | undefined {
    return this.activeSVDiagnostic;
  }

  public set activeDiagnostic(value: SarifViewerVsCodeDiagnostic | undefined) {
    if (this.activeSVDiagnostic !== value) {
      this.activeSVDiagnostic = value;
      this.onDidChangeActiveDiagnosticEventEmitter.fire(value);
    }
  }

  // Verbosity setting, and corresponding event.
  private currentVerbosity: sarif.ThreadFlowLocation.importance = "important";

  private onDidChangeVerbosityEventEmitter: EventEmitter<
    sarif.ThreadFlowLocation.importance
  > = new EventEmitter<sarif.ThreadFlowLocation.importance>();

  public get onDidChangeVerbosity(): Event<
    sarif.ThreadFlowLocation.importance
  > {
    return this.onDidChangeVerbosityEventEmitter.event;
  }

  public get selectedVerbosity(): sarif.ThreadFlowLocation.importance {
    return this.currentVerbosity;
  }

  public set selectedVerbosity(value: sarif.ThreadFlowLocation.importance) {
    if (this.currentVerbosity !== value) {
      this.currentVerbosity = value;
      this.onDidChangeVerbosityEventEmitter.fire(value);
    }
  }

  // Web view message events
  private onWebViewMessageEventEmitter: EventEmitter<
    WebviewMessage
  > = new EventEmitter<WebviewMessage>();

  public get onWebViewMessage(): Event<WebviewMessage> {
    return this.onWebViewMessageEventEmitter.event;
  }

  public readonly diagnosticCollection: SVDiagnosticCollection;

  private activeTab: string | undefined;
  private selectedCodeFlowRow: string | undefined;
  private wvPanel: WebviewPanel | undefined;

  private get webviewPanel(): WebviewPanel {
    return this.createWebview();
  }

  public constructor(
    private readonly extensionContext: ExtensionContext,
    fileMapper: FileMapper
  ) {
    this.disposables.push(this.onDidChangeVerbosityEventEmitter);
    this.disposables.push(this.onDidChangeActiveDiagnosticEventEmitter);
    this.disposables.push(
      commands.registerCommand(
        ExplorerController.ExplorerLaunchCommand,
        this.createWebview.bind(this)
      )
    );
    this.diagnosticCollection = new SVDiagnosticCollection(fileMapper);
    this.disposables.push(this.diagnosticCollection);
  }

  public dispose(): void {
    Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }

  /**
   * Creates the Webview panel
   */
  public createWebview(): WebviewPanel {
    if (this.wvPanel) {
      if (!this.wvPanel.visible) {
        this.wvPanel.reveal(ViewColumn.Two, false);
        this.diagnosticCollection.clear();
      }
    } else {
      this.wvPanel = window.createWebviewPanel(
        "shiftleftScan",
        ExplorerController.ExplorerTitle,
        { preserveFocus: true, viewColumn: ViewColumn.Two },
        {
          enableScripts: true,
          localResourceRoots: [
            Uri.file(
              this.extensionContext.asAbsolutePath(
                path.posix.join("node_modules", "requirejs")
              )
            ),
            Uri.file(
              this.extensionContext.asAbsolutePath(
                path.posix.join("resources", "explorer")
              )
            ),
            Uri.file(
              this.extensionContext.asAbsolutePath(
                path.posix.join("out", "explorer")
              )
            ),
          ],
        }
      );

      this.wvPanel.webview.onDidReceiveMessage(this.onReceivedMessage, this);
      this.wvPanel.onDidDispose(this.onWebviewDispose, this);
      this.wvPanel.webview.html = this.getWebviewContent(this.wvPanel);
    }
    return this.wvPanel;
  }

  /**
   * Clears the webviewpanel field if the weview gets closed
   */
  public onWebviewDispose(): void {
    this.wvPanel = undefined;
  }

  /**
   * Handles when a message comes in from the Webview
   * @param message the message from the webview describing the type and data of the message
   */
  public async onReceivedMessage(message: WebviewMessage): Promise<void> {
    // Have the explorer controller set up whatever state it needs
    // BEFORE firing the event out so the stat is consistent in the
    // explorer controller before others receive the web view message.
    switch (message.type) {
      case MessageType.CodeFlowSelectionChange:
        this.selectedCodeFlowRow = message.data;
        break;

      case MessageType.VerbosityChanged:
        if (!Utilities.isThreadFlowImportance(message.data)) {
          throw new Error("Unhandled verbosity level");
        }

        if (this.selectedVerbosity !== message.data) {
          this.selectedVerbosity = message.data;
        }
        break;

      case MessageType.ExplorerLoaded:
        if (this.resultsListData) {
          const webViewMessage: WebviewMessage = {
            data: JSON.stringify(this.resultsListData),
            type: MessageType.ResultsListDataSet,
          };
          this.sendMessage(webViewMessage, false);
        }

        if (this.activeDiagnostic) {
          this.sendActiveDiagnostic(true);
        }
        break;

      case MessageType.TabChanged:
        this.activeTab = message.data;
        break;

      case MessageType.PerformScan:
        this.diagnosticCollection.clear();
    }

    this.onWebViewMessageEventEmitter.fire(message);
  }

  /**
   * Sets the active diagnostic that's showns in the Webview, resets the saved webview state(selected row, etc.)
   * @param diag diagnostic to show
   * @param mappingUpdate optional flag to indicate a mapping update and the state shouldn't be reset
   */
  public setActiveDiagnostic(
    diag: SarifViewerVsCodeDiagnostic,
    mappingUpdate?: boolean
  ): void {
    if (
      !this.activeDiagnostic ||
      this.activeDiagnostic !== diag ||
      mappingUpdate
    ) {
      this.activeDiagnostic = diag;
      if (!mappingUpdate) {
        this.activeTab = undefined;
        this.selectedCodeFlowRow = undefined;
      }
      this.sendActiveDiagnostic(false);
    }
  }

  /**
   * Sets the results list data and updates the Explore's results list data
   * @param dataSet new dataset to set
   */
  public setResultsListData(dataSet: ResultsListData): void {
    this.resultsListData = dataSet;
    const webviewMessage: WebviewMessage = {
      data: JSON.stringify(dataSet),
      type: MessageType.ResultsListDataSet,
    };
    this.sendMessage(webviewMessage, false);
  }

  /**
   * sets the selected codeflow row, tells the webview to show and select the row
   * @param id Id of the codeflow row
   */
  public setSelectedCodeFlow(id: string): void {
    this.selectedCodeFlowRow = id;
    this.sendMessage(
      { data: id, type: MessageType.CodeFlowSelectionChange },
      false
    );
  }

  /**
   * Joins the path and converts it to a vscode resource schema
   * @param pathParts The path parts to join
   */
  private getVSCodeResourcePath(...pathParts: string[]): Uri {
    const vscodeResource: string = "vscode-resource";
    const diskPath: string = this.extensionContext.asAbsolutePath(
      path.join(...pathParts)
    );
    const uri: Uri = Uri.file(diskPath);
    return uri.with({ scheme: vscodeResource });
  }

  /**
   * defines the default webview html content
   */
  private getWebviewContent(webViewPanel: WebviewPanel): string {
    const resourcesPath: string[] = ["resources", "explorer"];

    const cssExplorerDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "explorer.css"
    );
    const spectreDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "spectre.min.css"
    );
    const cssListTableDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "listTable.css"
    );
    const cssResultsListDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "resultsList.css"
    );
    const jQueryDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "jquery-3.3.1.min.js"
    );

    /*
    const animatedGifPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "giphy.gif"
    );
    */

    const colResizeDiskPath: Uri = this.getVSCodeResourcePath(
      ...resourcesPath,
      "colResizable-1.6.min.js"
    );
    const requireJsPath: Uri = this.getVSCodeResourcePath(
      "node_modules",
      "requirejs",
      "require.js"
    );
    const explorerPath: Uri = this.getVSCodeResourcePath(
      "out",
      "explorer",
      "systemExplorer.js"
    );
    const scanRunning: boolean = Scan.isScanRunning();
    const resultsClass: string = scanRunning ? "hide" : "";
    const scanClass: string = !scanRunning ? "hide" : "";

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Scan Results</title>
            <link rel="stylesheet" type="text/css" href = "${spectreDiskPath}">
            <link rel="stylesheet" type="text/css" href = "${cssListTableDiskPath}">
            <link rel="stylesheet" type="text/css" href = "${cssExplorerDiskPath}">
            <link rel="stylesheet" type="text/css" href = "${cssResultsListDiskPath}">
            <script src="./node_modules/systemjs/dist/system.js"></script>
            <script src="${jQueryDiskPath}"></script>
            <script src="${colResizeDiskPath}"></script>
            <script data-main="${explorerPath}" src="${requireJsPath}"></script>
        </head>
        <body class="shiftleft-scan">
            <div class="container grid-xl">
            <header class="navbar" style="height: 4rem;">
              <section class="navbar-section">
                <a href="https://slscan.io" class="navbar-brand">Scan (skæn)</a>
              </section>
            </header>
            <div id="emptyResults" class="${resultsClass}">
              <div class="columns col-gapless"><div class="column col-12">
                <div class="empty">
                  <p class="empty-title h3">Welcome back</p>
                  <p class="empty-subtitle">Click the button to scan your project</p>
                  <div class="empty-action">
                    <button class="btn btn-primary" id="scanBtn">Perform Security Scan</button>
                  </div>
                </div>
              </div></div>
              <div class="columns col-gapless d-hide"><div class="column col-12">
                <div class="card"><div class="card-header"><h4>Just started your scan?</h4></div><div class="card-body">
                  <p>The findings would appear here shortly ...</p>
                </div>
                <div class="card-footer">
                    <a id="shiftleft-scan-docs" href="https://docs.shiftleft.io/shiftleft/scan/scan">Learn more about Scan</a>
                </div>
                </div>
              </div></div>
            </div>
            <div id="scanRunning" class="${scanClass}">
              <div class="columns col-gapless"><div class="column col-12">
                <div class="empty">
                  <p class="empty-title h3">Security scan has started</p>
                  <p class="empty-subtitle">Scan findings would appear here shortly ...</p>
                </div>
              </div></div>
            </div>
            <div id="results" class="${resultsClass}">
              <div class="columns">
                <div class="column col-12">
                  <div id="resultslistheader" class="headercontainer expanded"></div>
                  <div id="resultslistcontainer">
                      <div id="resultslistbuttonbar"></div>
                      <div id="resultslisttablecontainer">
                          <table id="resultslisttable" class="listtable"></table>
                      </div>
                  </div>
                  <div id="result-details">
                    <div id="resultdetailsheader" class="headercontainer expanded"></div>
                    <div id="resultdetailscontainer"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <script>
             requirejs(['systemExplorer'], function () {
               require(["explorer/webview"], function(webView) {
                  webView.startExplorer();
               });
             });
          </script>
        </body>
        </html>`;
  }

  /**
   * Creates the webview message based on the current active diagnostic and saved state and sends to the webview
   * @param focus flag for setting focus to the webview
   */
  private sendActiveDiagnostic(focus: boolean): void {
    if (!this.activeDiagnostic) {
      // Empty string is used to signal no selected diagnostic
      this.sendMessage({ data: "", type: MessageType.NewDiagnostic }, focus);
      return;
    }

    const diagData: DiagnosticData = {
      activeTab: this.activeTab,
      selectedRow: this.selectedCodeFlowRow,
      selectedVerbosity: this.selectedVerbosity,
      resultInfo: this.activeDiagnostic.resultInfo,
      runInfo: this.activeDiagnostic.resultInfo.runInfo,
    };

    const dataString: string = JSON.stringify(diagData);
    this.sendMessage(
      { data: dataString, type: MessageType.NewDiagnostic },
      focus
    );
  }

  /**
   * Handles sending a message to the webview
   * @param message Message to send, message has a type and data
   * @param focus flag for if the webview panel should be given focus
   */
  private sendMessage(message: WebviewMessage, focus: boolean): void {
    if (!this.webviewPanel.visible) {
      this.webviewPanel.reveal(undefined, !focus);
    }

    // We do not want to wait for this promise to finish as we are
    // just adding the message to the web-views queue.
    // tslint:disable-next-line: no-floating-promises
    this.webviewPanel.webview.postMessage(message);
  }
}
