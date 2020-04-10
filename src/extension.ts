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

import { ExtensionContext } from "vscode";
import { CodeFlowCodeLensProvider } from "./CodeFlowCodeLens";
import { CodeFlowDecorations } from "./CodeFlowDecorations";
import { ExplorerController } from "./ExplorerController";
import { Scan } from "./Scan";
import { LogReader } from "./LogReader";
import { SVCodeActionProvider } from "./SVCodeActionProvider";
import { Utilities } from "./Utilities";
import { ResultsListController } from "./ResultsListController";
import { FileMapper } from "./FileMapper";

/**
 * This method is called when the extension is activated.
 * Creates the explorer, reader, provider
 * Process any open SARIF Files
 */
export async function activate(context: ExtensionContext): Promise<void> {
  Utilities.initialize(context);
  Scan.initialize(context);

  const fileMapper: FileMapper = new FileMapper();
  context.subscriptions.push(fileMapper);

  const explorerController: ExplorerController = new ExplorerController(
    context,
    fileMapper
  );
  context.subscriptions.push(explorerController);

  const codeActionProvider: SVCodeActionProvider = new SVCodeActionProvider(
    explorerController
  );
  context.subscriptions.push(codeActionProvider);

  context.subscriptions.push(
    new ResultsListController(
      explorerController,
      codeActionProvider,
      explorerController.diagnosticCollection
    )
  );

  context.subscriptions.push(new CodeFlowCodeLensProvider(explorerController));

  context.subscriptions.push(
    new CodeFlowDecorations(explorerController, fileMapper)
  );

  // Read the initial set of open SARIF files
  const reader: LogReader = new LogReader(explorerController, fileMapper);
  context.subscriptions.push(reader);

  // Search the workspace for any sarif files.
  void reader.readWorkspace();
}

/**
 * Clean up extension if it gets deactivated
 */
export function deactivate(): void {
  // ToDo: rusty: Close html preview, unregister events, clear diagnostic collection
  Utilities.removeSarifViewerTempDirectory();
}
