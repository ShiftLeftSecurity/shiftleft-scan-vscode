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

import {
  CancellationToken,
  CodeLens,
  CodeLensProvider,
  Disposable,
  Event,
  EventEmitter,
  languages,
  ProviderResult,
  TextDocument,
} from "vscode";
import { ExplorerController } from "./ExplorerController";
import { Location } from "./common/Interfaces";
import { SarifViewerVsCodeDiagnostic } from "./SarifViewerDiagnostic";
import * as sarif from "sarif";

/**
 * This class handles providing the CodeFlow step codelenses for the current diagnostic
 */
export class CodeFlowCodeLensProvider implements CodeLensProvider, Disposable {
  private disposables: Disposable[] = [];
  private onDidChangeCodeLensesEmitter: EventEmitter<void> = new EventEmitter<
    void
  >();
  private activeDiagnostic: SarifViewerVsCodeDiagnostic | undefined;
  private selectedVerbosity: sarif.ThreadFlowLocation.importance = "important";

  public constructor(explorerController: ExplorerController) {
    this.disposables.push(this.onDidChangeCodeLensesEmitter);
    this.disposables.push(languages.registerCodeLensProvider("*", this));
    this.disposables.push(
      explorerController.onDidChangeVerbosity(
        this.onDidChangeVerbosity.bind(this)
      )
    );
    this.disposables.push(
      explorerController.onDidChangeActiveDiagnostic(
        this.onDidChangeActiveDiagnostic.bind(this)
      )
    );
  }

  /**
   * For disposing on extension close
   */
  public dispose(): void {
    Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }

  public get onDidChangeCodeLenses(): Event<void> {
    return this.onDidChangeCodeLensesEmitter.event;
  }

  /**
   * Compute a list of [lenses](#CodeLens). This call should return as fast as possible and if
   * computing the commands is expensive implementors should only return code lens objects with the
   * range set and implement [resolve](#CodeLensProvider.resolveCodeLens).
   * @param document The document in which the command was invoked.
   * @param token A cancellation token.
   */
  public provideCodeLenses(
    document: TextDocument,
    token: CancellationToken
  ): ProviderResult<CodeLens[]> {
    if (!this.activeDiagnostic) {
      return [];
    }
    const codeLenses: CodeLens[] = [];

    for (const codeFlow of this.activeDiagnostic.resultInfo.codeFlows) {
      for (const threadFlow of codeFlow.threads) {
        for (const step of threadFlow.steps) {
          const stepLoc: Location | undefined = step.location;
          if (
            !stepLoc ||
            !stepLoc.uri ||
            stepLoc.uri.toString() !== document.uri.toString()
          ) {
            continue;
          }

          // If the importance is "essential", then we never hide it from the user.
          // If the users has selected "unimportant", then we will show them everything.
          // It the step matches the selected verbosity, then we are good to go.
          if (
            step.importance === "essential" ||
            this.selectedVerbosity === "unimportant" ||
            step.importance === this.selectedVerbosity
          ) {
            codeLenses.push(new CodeLens(stepLoc.range, step.codeLensCommand));
          }
        }
      }
    }

    return codeLenses;
  }

  /**
   * Use to trigger a refresh of the CodeFlow CodeLenses
   */
  private onDidChangeVerbosity(
    verbosity: sarif.ThreadFlowLocation.importance
  ): void {
    this.selectedVerbosity = verbosity;
    this.onDidChangeCodeLensesEmitter.fire();
  }

  /**
   * Use to trigger a refresh of the CodeFlow CodeLenses
   */
  public onDidChangeActiveDiagnostic(
    diagnostic: SarifViewerVsCodeDiagnostic | undefined
  ): void {
    this.activeDiagnostic = diagnostic;
    this.onDidChangeCodeLensesEmitter.fire();
  }
}
