/*!
 * Copyright (c) ShiftLeft Inc. All Rights Reserved.
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
   * Perform ShiftLeft Scan
   */
  public static async performSastScan(): Promise<void> {
    if (Scan.scanInProgress) {
      return;
    }
    const sarifConfig: WorkspaceConfiguration = workspace.getConfiguration(
      Utilities.configSection
    );
    const containerImage: string = sarifConfig.get(
      Scan.configContainerImage,
      "shiftleft/sast-scan"
    );
    const scanMode: string = sarifConfig.get(Scan.configScanMode, "ide");
    const disableTelemetry: boolean = sarifConfig.get(Scan.configDisableTelemetry, false);
    const appRoot: string = workspace?.workspaceFolders![0].uri.path;
    const cmdArgs: string[] = [
      "run",
      "--rm",
      "-e",
      '"WORKSPACE=' + appRoot + '"',
      "-v",
      '"' + appRoot + ':/app:cached"',
      disableTelemetry ? "DISABLE_TELEMETRY=true" : "",
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
    Scan.scanInProgress = true;
    proc.stdout.on("data", async (data: string) => {
      setTimeout(() => {
        outputChannel.appendLine(data);
      }, 500);
    });
    proc.stderr.on("data", async (data: string) => {
      setTimeout(() => {
        outputChannel.appendLine(data);
      }, 500);
    });
    proc.on("close", async (code) => {
      Scan.scanInProgress = false;
      if (code !== 0) {
        await window.showErrorMessage(
          `ShiftLeft scan has failed. Please check if docker is running. ${cmdArgs.join(
            " "
          )}`,
          { modal: false }
        );
      } else {
        outputChannel.appendLine("ShiftLeft Scan completed successfully 👍");
        await commands.executeCommand("extension.shiftleft.LaunchExplorer");
        const sarifFiles: Uri[] = await workspace.findFiles(
          "reports/*.sarif",
          "**/node_modules/**",
          3
        );
        if (sarifFiles && sarifFiles.length) {
          for (const f in sarifFiles) {
            await workspace.openTextDocument(sarifFiles[f]);
          }
        }
      }
    });
  }
}
