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
import { RunInfo } from "../common/Interfaces";
import { Utilities } from "../Utilities";

/**
 * Namespace that has the functions for processing (and transforming) the Sarif run
 * a model used by the Web Panel..
 */
export namespace RunInfoFactory {
  /**
   * Processes the run passed in and creates a new RunInfo object with the information processed
   * @param run SARIF run object to process
   * @param sarifFileName path and file name of the sarif file this run is in
   */
  export function create(run: sarif.Run, sarifFileName: string): RunInfo {
    const tool: sarif.ToolComponent = run.tool.driver;

    let toolFullName: string = tool.fullName || tool.name;

    if (tool.semanticVersion) {
      toolFullName += `(${tool.semanticVersion})`;
    }

    let toolFileName: string | undefined;
    let workingDir: string | undefined;
    let cmdLine: string | undefined;
    let startUtc: string | undefined;
    let timeDuration: string | undefined;
    let automationIdentifier: string | undefined;
    let automationCategory: string | undefined;

    if (run.invocations && run.invocations[0]) {
      const invocation: sarif.Invocation = run.invocations[0];
      cmdLine = invocation.commandLine;
      if (invocation.executableLocation) {
        toolFileName = invocation.executableLocation.uri;
      }

      if (invocation.workingDirectory) {
        workingDir = invocation.workingDirectory.uri;
      }

      startUtc = invocation.startTimeUtc;
      timeDuration = Utilities.calcDuration(
        invocation.startTimeUtc,
        invocation.endTimeUtc
      );
    }

    if (run.automationDetails && run.automationDetails.id !== undefined) {
      const splitId: string[] = run.automationDetails.id.split("/");
      const identifier: string | undefined = splitId.pop();
      if (identifier !== "") {
        automationIdentifier = identifier;
      }

      const category: string = splitId.join("/");
      if (identifier !== "") {
        automationCategory = category;
      }
    }

    return {
      id: 0,
      toolName: tool.name,
      toolFullName,
      toolFileName,
      workingDir,
      cmdLine,
      timeDuration,
      additionalProperties: run.properties,
      expandedBaseIds: Utilities.expandBaseIds(run.originalUriBaseIds),
      sarifFileFullPath: sarifFileName,
      sarifFileName: path.basename(sarifFileName),
      automationCategory,
      automationIdentifier,
      startUtc,
    };
  }
}
