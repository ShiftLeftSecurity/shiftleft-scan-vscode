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
import { platform } from "os";
import {
  ChildProcess,
  spawn,
  spawnSync,
  SpawnSyncReturns,
  ExecOptions,
} from "child_process";
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

  // Variable to track if scan cli is available locally
  private static scanCliAvailable: boolean = false;

  // Configuration keys
  private static readonly configContainerTool = "containerTool";
  private static readonly configContainerImage = "containerImage";
  private static readonly configScanMode = "scanMode";
  private static readonly configDisableTelemetry = "disableTelemetry";
  private static readonly configAppRoot = "appRoot";
  private static readonly configAppName = "appName";
  private static readonly configOrgId = "orgId";
  private static readonly configOrgToken = "orgToken";
  private static readonly configAccessToken = "accessToken";

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
   * Method to check if local cli is available
   */
  public static checkLocalCommand(): boolean {
    if (Scan.scanCliAvailable) {
      return true;
    }
    const isWin: boolean = platform().indexOf("win") > -1;
    const where: string = isWin ? "where" : "which";
    const ret: SpawnSyncReturns<string> = spawnSync(where, ["scan"]);
    if (ret.status === 0 && !ret.error) {
      Scan.scanCliAvailable = true;
    }
    return Scan.scanCliAvailable;
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
   * Method to delete existing sarif files
   *
   * @string workspaceRoot Workspace root directory
   * @string appRoot Application root directory
   */
  public static async deleteResults(
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
        await workspace.fs.delete(sarifFiles[f], { useTrash: true });
      }
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
    const containerTool: string = sarifConfig.get(
      Scan.configContainerTool,
      "docker"
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
    const appNameFromConfig: string | undefined = sarifConfig.get(
      Scan.configAppName,
      undefined
    );
    const disableTelemetry: boolean = sarifConfig.get(
      Scan.configDisableTelemetry,
      false
    );
    const orgId: string | undefined = sarifConfig.get(
      Scan.configOrgId,
      undefined
    );
    const orgToken: string | undefined = sarifConfig.get(
      Scan.configOrgToken,
      undefined
    );
    const accessToken: string | undefined = sarifConfig.get(
      Scan.configAccessToken,
      undefined
    );
    const workspaceRoot: string = workspace?.workspaceFolders![0].uri.fsPath;
    const workspaceName: string = workspace?.workspaceFolders![0].name;
    const appRoot: string =
      appRootFromConfig && appRootFromConfig !== ""
        ? appRootFromConfig
        : workspaceRoot;
    const appName: string =
      appNameFromConfig && appNameFromConfig !== ""
        ? appNameFromConfig
        : workspaceName;
    const inspectArgs: string[] = [
      "",
      appName ? '"SHIFTLEFT_APP=' + appName + '"' : "",
      orgId ? '"SHIFTLEFT_ORG_ID=' + orgId + '"' : "",
      orgToken ? '"SHIFTLEFT_ORG_TOKEN=' + orgToken + '"' : "",
      accessToken ? '"SHIFTLEFT_ACCESS_TOKEN=' + accessToken + '"' : "",
    ];

    // Process environment variables
    const env: ExecOptions["env"] = {
      WORKSPACE: appRoot,
    };
    const isInspectEnabled: boolean = !!orgId && !!orgToken && !!accessToken;
    if (isInspectEnabled) {
      env["SHIFTLEFT_ORG_ID"] = orgId;
      env["SHIFTLEFT_ORG_TOKEN"] = orgToken;
      env["SHIFTLEFT_ACCESS_TOKEN"] = accessToken;
      if (containerImage === "shiftleft/sast-scan") {
        containerImage = "shiftleft/scan-java";
      }
    }
    if (disableTelemetry) {
      env["DISABLE_TELEMETRY"] = true;
    }
    let cmdArgs: string[] = [];
    let baseCmd: string = containerTool;
    if (Scan.checkLocalCommand()) {
      cmdArgs = ["--src", appRoot, "--mode", scanMode];
      baseCmd = "scan";
    } else {
      cmdArgs = [
        "run",
        "--rm",
        "-e",
        '"WORKSPACE=' + appRoot + '"',
        isInspectEnabled ? inspectArgs.join(" -e ") : "",
        "-v",
        '"' + appRoot + ':/app"',
        disableTelemetry ? "-e DISABLE_TELEMETRY=true" : "",
        containerImage,
        "scan",
        "--mode",
        scanMode,
      ];
    }
    cmdArgs = cmdArgs.filter((v) => v !== "");
    const outputChannel: OutputChannel = window.createOutputChannel(
      isInspectEnabled ? "ShiftLeft Inspect" : "ShiftLeft Scan"
    );
    if (isInspectEnabled) {
      outputChannel.appendLine(`⚡︎ ShiftLeft Inspect scan has started ...`);
    } else {
      outputChannel.appendLine(`⚡︎ Security scan has started ...`);
    }
    // DEBUG
    outputChannel.appendLine(baseCmd);
    outputChannel.appendLine(cmdArgs.join(" "));
    outputChannel.show(true);
    if (baseCmd !== "podman") {
      await Scan.deleteResults(workspaceRoot, appRoot);
    }
    const proc: ChildProcess = spawn(baseCmd, cmdArgs, {
      shell: true,
      env: env,
    });
    proc.stdout.on("data", async (data: string) => {
      setTimeout(async () => {
        if (data.includes("========")) {
          await Scan.showResults(workspaceRoot, appRoot);
        }
        outputChannel.appendLine(data);
      }, 500);
    });
    proc.stderr.on("data", async (data: string) => {
      setTimeout(async () => {
        if (data.includes("========")) {
          await Scan.showResults(workspaceRoot, appRoot);
        }
        outputChannel.appendLine(data);
      }, 500);
    });
    proc.on("close", async (code: number) => {
      Scan.scanInProgress = false;
      if (code !== 0) {
        await window.showErrorMessage(
          baseCmd === "docker"
            ? `ShiftLeft scan has failed. Please check if docker desktop is running`
            : `Unable to scan using podman. Please retry with docker`,
          { modal: false }
        );
      } else {
        await Scan.showResults(workspaceRoot, appRoot);
        outputChannel.hide();
      }
    });
  }
}
