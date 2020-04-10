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

import * as vscode from "vscode";
import { ExplorerController } from "./ExplorerController";
import { FileMapper } from "./FileMapper";
import { SarifViewerVsCodeDiagnostic } from "./SarifViewerDiagnostic";
import * as sarif from "sarif";

/**
 * A codeactionprovider for the SARIF extension that handles updating the Explorer when the result focus changes
 * Also adds the Map to Source fix for the results that were not able to be mapped previously
 */
export class SVCodeActionProvider
  implements vscode.CodeActionProvider, vscode.Disposable {
  private isFirstCall: boolean = true;
  private disposables: vscode.Disposable[] = [];

  public constructor(private readonly explorerController: ExplorerController) {
    this.disposables.push(
      vscode.languages.registerCodeActionsProvider("*", this)
    );
  }

  /**
   * For disposing on extension close
   */
  public dispose(): void {
    vscode.Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }

  /**
   * Gets called when focus gets put into an issue in the source files. This checks if it's one of our diagnostics
   * then it will update the explorer with the new diagnostic
   * If the result hasn't been mapped it will add a Map to Source option in the fixs tool
   * @param document The document in which the command was invoked.
   * @param range The range for which the command was invoked.
   * @param context Context carrying additional information, this has the SVDiagnostic with our result payload.
   * @param token A cancellation token.
   */
  public async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    token?: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    const index: number = context.diagnostics.findIndex(
      (x) => (<SarifViewerVsCodeDiagnostic>x).resultInfo !== undefined
    );
    if (context.only || index === -1) {
      return [];
    }
    const svDiagnostic: SarifViewerVsCodeDiagnostic = <
      SarifViewerVsCodeDiagnostic
    >context.diagnostics[index];
    // This diagnostic with the source name of "SARIFViewer" is the place holder for the problems panel limit message,
    // can possibly put logic here to allow for showing next set of diagnostics
    if (svDiagnostic.source !== "SARIFViewer") {
      if (this.isFirstCall) {
        await vscode.commands.executeCommand(
          ExplorerController.ExplorerLaunchCommand
        );
        this.isFirstCall = false;
      }

      this.explorerController.setActiveDiagnostic(svDiagnostic);

      return this.getCodeActions(svDiagnostic);
    }

    return [];
  }

  /**
   * Creates the set of code actions for the passed in Sarif Viewer Diagnostic
   * @param svDiagnostic the Sarif Viewer Diagnostic to create the code actions from
   */
  private getCodeActions(
    svDiagnostic: SarifViewerVsCodeDiagnostic
  ): vscode.CodeAction[] {
    const rawLocations: sarif.Location[] | undefined =
      svDiagnostic.rawResult.locations;
    const actions: vscode.CodeAction[] = [];

    if (
      (!svDiagnostic.resultInfo.assignedLocation ||
        !svDiagnostic.resultInfo.assignedLocation.mapped) &&
      rawLocations
    ) {
      const physicalLocation: sarif.PhysicalLocation | undefined =
        rawLocations[0].physicalLocation;

      if (physicalLocation && physicalLocation.artifactLocation) {
        const cmd: vscode.Command = {
          arguments: [
            svDiagnostic.runInfo,
            physicalLocation.artifactLocation,
            svDiagnostic.resultInfo.runId,
          ],
          command: FileMapper.MapCommand,
          title: "Map To Source",
        };

        const action: vscode.CodeAction = {
          command: cmd,
          diagnostics: this.explorerController.diagnosticCollection.getAllUnmappedDiagnostics(),
          kind: vscode.CodeActionKind.QuickFix,
          title: "Map To Source",
        };

        actions.push(action);
      }
    }

    return actions;
  }
}
