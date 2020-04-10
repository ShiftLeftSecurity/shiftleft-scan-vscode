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

import { Progress } from "vscode";

/**
 * Helper for the progress message in VSCode
 */
export class ProgressHelper {
  private static instance: ProgressHelper;

  private progress:
    | Progress<{ message?: string; increment?: number }>
    | undefined;
  private currentProgress: { message?: string; increment?: number } | undefined;

  public static get Instance(): ProgressHelper {
    if (!ProgressHelper.instance) {
      ProgressHelper.instance = new ProgressHelper();
    }

    return ProgressHelper.instance;
  }

  public get CurrentMessage(): string | undefined {
    return this.currentProgress && this.currentProgress.message;
  }

  public get CurrentIncrement(): number | undefined {
    return this.currentProgress && this.currentProgress.increment;
  }

  public set Progress(
    progress: Progress<{ message?: string; increment?: number }> | undefined
  ) {
    this.progress = progress;
  }

  /**
   * Updates the message and increment, only sets the report if a Progress object is set
   * @param message message to set on the progress dialog box
   * @param increment amount to fill the progress bar
   */
  public async setProgressReport(
    message?: string,
    increment?: number
  ): Promise<void> {
    if (this.progress) {
      const update: { message?: string; increment?: number } = {
        message,
        increment,
      };
      this.progress.report(update);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve();
        }, 100);
      });
    }
  }
}
