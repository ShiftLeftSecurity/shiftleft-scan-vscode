/*!
 * Copyright (c) ShiftLeft Inc. All Rights Reserved.
 */

import * as path from "path";
import * as sarif from "sarif";
import {
  commands,
  Uri,
  ViewColumn,
  WebviewPanel,
  window,
  ExtensionContext,
  EventEmitter,
  Event,
  Disposable,
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

/**
 * This class handles generating and providing the HTML content for the Explorer panel
 */
export class ExplorerController implements Disposable {
  private disposables: Disposable[] = [];

  public static readonly ExplorerLaunchCommand =
    "extension.shiftleft.LaunchExplorer";
  private static readonly ExplorerTitle = "ShiftLeft Scan Results";

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
        this.wvPanel.reveal(undefined, false);
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

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ShiftLeft Scan Results</title>
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
                <a href="https://shiftleft.io" class="navbar-brand"><svg height="50px" viewBox="0 0 95 21"><g id="Styles" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g id="Components-I" transform="translate(-72.000000, -212.000000)"><g id="Group" transform="translate(48.000000, 48.000000)"><g id="Header-and-Nav"><g id="Main-Header" transform="translate(0.000000, 43.000000)"><g id="Main-Header-Hover-/-Selected" transform="translate(0.000000, 105.000000)"><g id="Logo" transform="translate(24.000000, 16.500000)"><path d="M94.40652,16.35992 C93.88612,16.55992 93.16612,16.67992 92.24652,16.67992 C89.88612,16.67992 88.96612,15.15992 88.96612,13.00032 L88.96612,9.11992 L86.04652,9.11992 L86.04652,16.47992 L83.20652,16.47992 L83.20652,9.11992 L81.88612,9.11992 L81.88612,6.95992 L83.20652,6.83992 L83.20652,6.31992 C83.20652,4.27992 84.12652,2.63992 86.76612,2.63992 C87.56612,2.63992 88.28612,2.83992 88.72652,2.95992 L88.20652,5.00032 C87.88612,4.87992 87.48612,4.80032 87.16612,4.80032 C86.44652,4.80032 86.04652,5.20032 86.04652,6.11992 L86.04652,6.71992 L89.20652,6.71992 L89.52652,4.15992 L91.88652,4.15992 L91.88652,6.71992 L94.24652,6.71992 L94.24652,8.95992 L91.88652,8.95992 L91.88652,12.83992 C91.88652,13.95992 92.40652,14.35992 93.12652,14.35992 C93.44652,14.35992 93.72652,14.23992 94.04652,14.15992 L94.40652,16.35992 Z" id="Fill-14" fill="#3ECF8E"></path><path d="M78.36628,10.64 C78.36628,9.52 77.84628,8.8 76.72628,8.8 C75.80668,8.8 75.08628,9.4 74.88628,10.64 L78.36628,10.64 Z M76.76628,6.56 C79.52628,6.56 80.84628,8.6 80.84628,11.16 C80.84628,11.68 80.72628,12.08 80.72628,12.4 L75.00668,12.4 C75.20668,13.84 76.24628,14.44 77.44628,14.44 C78.16628,14.44 78.76628,14.24 79.48628,13.84 L80.40668,15.56 C79.36628,16.28 78.16628,16.68 77.04628,16.68 C74.28628,16.68 72.12628,14.84 72.12628,11.68 C72.16628,8.52 74.40668,6.56 76.76628,6.56 L76.76628,6.56 Z" id="Fill-13" fill="#3ECF8E"></path><polygon id="Fill-12" fill="#3ECF8E" points="63.4862 3.79996 66.3266 3.79996 66.3266 13.99996 71.3266 13.99996 71.3266 16.43996 63.4462 16.43996"></polygon><path d="M61.64636,16.35992 C61.12636,16.55992 60.40636,16.67992 59.48636,16.67992 C57.12636,16.67992 56.20636,15.15992 56.20636,13.00032 L56.20636,9.11992 L53.24636,9.11992 L53.24636,16.47992 L50.40636,16.47992 L50.40636,9.11992 L49.08636,9.11992 L49.08636,6.95992 L50.40636,6.83992 L50.40636,6.31992 C50.40636,4.27992 51.32636,2.63992 53.96636,2.63992 C54.76636,2.63992 55.48636,2.83992 55.92636,2.95992 L55.40636,5.00032 C55.08636,4.87992 54.68636,4.80032 54.36636,4.80032 C53.64636,4.80032 53.24636,5.20032 53.24636,6.11992 L53.24636,6.71992 L56.40636,6.71992 L56.72636,4.15992 L59.08676,4.15992 L59.08676,6.71992 L61.44636,6.71992 L61.44636,8.95992 L59.08676,8.95992 L59.08676,12.83992 C59.08676,13.95992 59.60636,14.35992 60.32636,14.35992 C60.64636,14.35992 60.92636,14.23992 61.24636,14.15992 L61.64636,16.35992 Z" id="Fill-11" fill="#FFFFFF"></path><path d="M44.7664,16.48 L47.6068,16.48 L47.6068,6.88 L44.7664,6.88 L44.7664,16.48 Z M44.5664,3.92 C44.5664,3 45.2864,2.48 46.2064,2.48 C47.1264,2.48 47.8464,3.08 47.8464,3.92 C47.8464,4.84 47.1264,5.44 46.2064,5.44 C45.2864,5.44 44.5664,4.84 44.5664,3.92 L44.5664,3.92 Z" id="Fill-9" fill="#FFFFFF"></path><path d="M34.36632,2.88004 L37.20672,2.88004 L37.20672,6.24004 L37.08632,7.96004 C37.80672,7.36004 38.72632,6.64004 40.04632,6.64004 C42.08632,6.64004 43.00672,8.08004 43.00672,10.52004 L43.00672,16.44004 L40.16632,16.44004 L40.16632,10.84004 C40.16632,9.40004 39.76632,9.00004 38.92632,9.00004 C38.20672,9.00004 37.80672,9.32004 37.20672,9.92004 L37.20672,16.44004 L34.36632,16.44004 L34.36632,2.88004 Z" id="Fill-7" fill="#FFFFFF"></path><path d="M24.84636,12.87984 C25.76636,13.67984 26.88636,14.20024 27.92636,14.20024 C29.16636,14.20024 29.64636,13.67984 29.64636,12.95984 C29.64636,12.15984 28.92636,11.92024 27.80636,11.43984 L26.16636,10.72024 C24.84636,10.20024 23.60636,9.07984 23.60636,7.23984 C23.60636,5.20024 25.44636,3.47984 28.08636,3.47984 C29.52636,3.47984 31.04636,4.07984 32.16636,5.12024 L30.72636,6.95984 C29.92636,6.35984 29.08636,5.92024 28.08636,5.92024 C27.16636,5.92024 26.44636,6.32024 26.44636,7.03984 C26.44636,7.83984 27.24636,8.07984 28.40636,8.55984 L30.04636,9.15984 C31.56636,9.75984 32.48636,10.80024 32.48636,12.63984 C32.48636,14.67984 30.76636,16.52024 27.80636,16.52024 C26.16636,16.52024 24.44636,15.92024 23.12636,14.67984 L24.84636,12.87984 Z" id="Fill-5" fill="#FFFFFF"></path><g id="logomark"><path d="M9.44636,9.00016 L16.68636,3.48016 L16.08636,11.35976 C16.08636,12.80016 15.68636,14.00016 14.96636,15.04016 L9.44636,10.84016 C8.84636,10.44016 8.84636,9.52016 9.44636,9.00016 Z" id="Fill-1" fill="#3ECF8E"></path><path d="M4.32644,10.84 C3.72644,10.32 3.72644,9.52 4.32644,9 L14.72644,1.04 C13.08604,0.52 10.64644,0 8.28604,0 C5.72644,0 3.16644,0.6 1.64644,1.04 C0.60644,1.36 -0.07356,2.36 0.00644,3.48 L0.60644,11.36 C0.60644,16.28 5.60644,18.8 7.56644,19.72 C8.08604,19.92 8.60644,19.92 9.08604,19.72 C10.00644,19.32 11.52644,18.6 12.84644,17.36 L4.32644,10.84 Z" id="Fill-3" fill="#FFFFFF"></path></g></g></g></g></g></g></g></g></svg> </a>
              </section>
            </header>
            <div id="emptyResults">
              <div class="columns col-gapless"><div class="column col-12">
                <div class="empty">
                  <p class="empty-title h3">No Scan Result found</p>
                  <p class="empty-subtitle">Click the button to scan your project</p>
                  <div class="empty-action">
                    <button class="btn btn-primary" id="scanBtn">Perform Security Scan</button>
                  </div>
                </div>
              </div></div>
            </div>
            <div id="scanRunning">
              <div class="columns col-gapless"><div class="column col-12">
                <div class="empty">
                  <p class="empty-title h3">Security scan has started</p>
                  <p class="empty-subtitle">Scan findings would appear here shortly ...</p>
                </div>
              </div></div>
            </div>
            <div id="results">
              <div class="columns"><div class="column col-12">
                <div id="resultslistheader" class="headercontainer expanded"></div>
                <div id="resultslistcontainer">
                    <div id="resultslistbuttonbar"></div>
                    <div id="resultslisttablecontainer">
                        <table id="resultslisttable" class="listtable"></table>
                    </div>
                </div>
                <div id="resultdetailsheader" class="headercontainer expanded"></div>
                <div id="resultdetailscontainer"></div>
              </div></div>
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
