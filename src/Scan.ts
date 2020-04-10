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
import { ChildProcess, spawn } from "child_process";
import {
  commands,
  OutputChannel,
  Uri,
  workspace,
  WorkspaceConfiguration,
  window,
} from "vscode";
import { Utilities } from "./Utilities";

export class Scan {
  /**
   * Flag to indicate if a scan is in progress
   */
  private static scanInProgress: boolean = false;

  // Configuration keys
  private static readonly configContainerImage = "containerImage";
  private static readonly configScanMode = "scanMode";
  private static readonly configDisableTelemetry = "disableTelemetry";
  private static readonly configAppRoot = "appRoot";

  public static initialize(extensionContext: vscode.ExtensionContext): void {
    Scan.registerCommands(extensionContext);
  }

  private static registerCommands(
    extensionContext: vscode.ExtensionContext
  ): void {
    extensionContext.subscriptions.push(
      commands.registerCommand(
        "extension.shiftleft.PerformScan",
        Scan.performSastScan
      )
    );
  }

  /**
   * Method to check if a scan is running
   */
  public static isScanRunning(): boolean {
    return Scan.scanInProgress;
  }

  /**
   * Method to show results based on existing sarif files
   *
   * @string workspaceRoot Workspace root directory
   * @string appRoot Application root directory
   */
  public static async showResults(
    workspaceRoot: string,
    appRoot: string
  ): Promise<void> {
    let relativeRoot: string = "";
    if (workspaceRoot !== appRoot) {
      relativeRoot = appRoot.replace(workspaceRoot + "/", "");
    }
    const sarifFiles: Uri[] = await workspace.findFiles(
      relativeRoot + "reports/*.sarif",
      "**/node_modules/**",
      5
    );
    if (sarifFiles && sarifFiles.length) {
      for (const f in sarifFiles) {
        await workspace.openTextDocument(sarifFiles[f]);
      }
      await commands.executeCommand("extension.shiftleft.LaunchExplorer");
    }
  }

  /**
   * Perform ShiftLeft Scan
   */
  public static async performSastScan(): Promise<void> {
    if (Scan.scanInProgress) {
      return;
    }
    // Mark the scan as in progress asap
    Scan.scanInProgress = true;
    const sarifConfig: WorkspaceConfiguration = workspace.getConfiguration(
      Utilities.configSection
    );
    const containerImage: string = sarifConfig.get(
      Scan.configContainerImage,
      "shiftleft/sast-scan"
    );
    const scanMode: string = sarifConfig.get(Scan.configScanMode, "ide");
    const appRootFromConfig: string | undefined = sarifConfig.get(
      Scan.configAppRoot,
      undefined
    );
    const disableTelemetry: boolean = sarifConfig.get(
      Scan.configDisableTelemetry,
      false
    );
    const workspaceRoot: string = workspace?.workspaceFolders![0].uri.fsPath;
    const appRoot: string =
      appRootFromConfig && appRootFromConfig !== ""
        ? appRootFromConfig
        : workspaceRoot;
    const cmdArgs: string[] = [
      "run",
      "--rm",
      "-e",
      '"WORKSPACE=' + appRoot + '"',
      "-v",
      '"' + appRoot + ':/app:cached"',
      disableTelemetry ? "-e DISABLE_TELEMETRY=true" : "",
      containerImage,
      "scan",
      "--mode",
      scanMode,
    ];
    const outputChannel: OutputChannel = window.createOutputChannel(
      "ShiftLeft Scan"
    );
    outputChannel.appendLine(
      `⚡︎ About to execute docker ${cmdArgs.join(" ")}`
    );
    outputChannel.show(true);
    const proc: ChildProcess = spawn("docker", cmdArgs, { shell: true });
    proc.stdout.on("data", async (data: string) => {
      setTimeout(async () => {
        outputChannel.appendLine(data);
        if (data.includes("========")) {
          await Scan.showResults(workspaceRoot, appRoot);
        }
      }, 500);
    });
    proc.stderr.on("data", async (data: string) => {
      setTimeout(async () => {
        outputChannel.appendLine(data);
        if (data.includes("========")) {
          await Scan.showResults(workspaceRoot, appRoot);
        }
      }, 500);
    });
    proc.on("close", async (code) => {
      Scan.scanInProgress = false;
      if (code !== 0) {
        await window.showErrorMessage(
          `ShiftLeft scan has failed. Please check if docker desktop is running`,
          { modal: false }
        );
      } else {
        outputChannel.appendLine("ShiftLeft Scan completed successfully 👍");
        await Scan.showResults(workspaceRoot, appRoot);
      }
    });
  }
}
