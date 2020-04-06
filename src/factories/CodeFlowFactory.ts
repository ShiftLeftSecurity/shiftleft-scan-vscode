/*!
 * Copyright (c) ShiftLeft Inc. All Rights Reserved.
 */

import * as sarif from "sarif";
import { LocationFactory } from "./LocationFactory";
import { Command } from "vscode";
import {
  CodeFlow,
  CodeFlowStep,
  CodeFlowStepId,
  Location,
  Message,
  ThreadFlow,
  RunInfo,
} from "../common/Interfaces";
import { Utilities } from "../Utilities";
import { sendCFSelectionToExplorerCommand } from "../CodeFlowDecorations";
import { FileMapper } from "../FileMapper";

const threadFlowLocations: Map<string, sarif.ThreadFlowLocation> = new Map<
  string,
  sarif.ThreadFlowLocation
>();

/**
 * Namespace that has the functions for processing (and transforming) the Sarif result code flows (thread flows, and steps) into
 * a model used by the Web Panel.
 */
export namespace CodeFlowFactory {
  /**
   * Processes the array of Sarif codeflow objects
   * @param fileMapper The file mapper used to map the URI locations to a valid local path.
   * @param runInfo The run the code flows belong to.
   * @param sarifCodeFlows array of Sarif codeflow objects to be processed
   */
  export async function create(
    fileMapper: FileMapper,
    runInfo: RunInfo,
    sarifCodeFlows: sarif.CodeFlow[] | undefined
  ): Promise<CodeFlow[]> {
    if (!sarifCodeFlows) {
      return [];
    }

    const codeFlows: CodeFlow[] = [];
    for (let cFIndex: number = 0; cFIndex < sarifCodeFlows.length; cFIndex++) {
      codeFlows.push(
        await CodeFlowFactory.createCodeFlow(
          fileMapper,
          runInfo,
          sarifCodeFlows[cFIndex],
          `${cFIndex}`
        )
      );
    }

    return codeFlows;
  }

  /**
   * Parses a text version of the codeflow id
   * Returns a CodeFlowStepId object or undefined if there's no valid matching id (placeholder or bad formatting)
   * @param idText the codeflow id in text format ex: 1_1_2
   */
  export function parseCodeFlowId(idText: string): CodeFlowStepId | undefined {
    let codeFlowId: CodeFlowStepId | undefined;

    if (idText !== "-1") {
      const cFSelectionId: string[] = idText.split("_");
      if (cFSelectionId.length === 3) {
        codeFlowId = {
          cFId: parseInt(cFSelectionId[0], 10),
          stepId: parseInt(cFSelectionId[2], 10),
          tFId: parseInt(cFSelectionId[1], 10),
        };
      }
    }

    return codeFlowId;
  }

  /**
   * Map ThreadFlowLocations array from the sarif file for
   * @param runInfo The run the thread flows belong to.
   * @param tFLocs The array of ThreadFlowLocations off of the run object
   */
  export function mapThreadFlowLocationsFromRun(
    runInfo: RunInfo,
    tFLocs: sarif.ThreadFlowLocation[]
  ): void {
    for (let index: number = 0; index < tFLocs.length; index++) {
      threadFlowLocations.set(`${runInfo.id}_${index}`, tFLocs[index]);
    }
  }

  /**
   * Tries to remap any of the not mapped codeflow objects in the array of processed codeflow objects
   * @param fileMapper The file mapper used to map the URI locations to a valid local path.
   * @param runInfo The run the code flows belong to.
   * @param codeFlows array of processed codeflow objects to try to remap
   * @param sarifCodeFlows Used if a codeflow needs to be remapped
   */
  export async function tryRemapCodeFlows(
    fileMapper: FileMapper,
    runInfo: RunInfo,
    codeFlows: CodeFlow[],
    sarifCodeFlows: sarif.CodeFlow[]
  ): Promise<void> {
    for (const [cFKey, codeFlow] of codeFlows.entries()) {
      for (const [tFKey, threadFlow] of codeFlow.threads.entries()) {
        for (const [stepKey, step] of threadFlow.steps.entries()) {
          if (step.location && !step.location.mapped) {
            const sarifLoc: sarif.Location | undefined =
              sarifCodeFlows[cFKey].threadFlows[tFKey].locations[stepKey]
                .location;
            if (sarifLoc) {
              const location: Location = await LocationFactory.create(
                fileMapper,
                runInfo,
                sarifLoc
              );
              codeFlows[cFKey].threads[tFKey].steps[
                stepKey
              ].location = location;
            }
          }
        }
      }
    }
  }

  /**
   * Creates the CodeFlow object from the passed in sarif codeflow object
   * @param fileMapper The file mapper used to map the URI locations to a valid local path.
   * @param runInfo The run the code flow belongs to.
   * @param sarifCF the sarif codeflow object to be processed
   * @param indexId The id based on the index in the codeflow array
   */
  export async function createCodeFlow(
    fileMapper: FileMapper,
    runInfo: RunInfo,
    sarifCF: sarif.CodeFlow,
    indexId: string
  ): Promise<CodeFlow> {
    const codeFlow: CodeFlow = {
      message: undefined,
      threads: [],
    };

    if (sarifCF.message !== undefined) {
      codeFlow.message = Utilities.parseSarifMessage(sarifCF.message).text;
    }
    for (
      let tFIndex: number = 0;
      tFIndex < sarifCF.threadFlows.length;
      tFIndex++
    ) {
      await CodeFlowFactory.createThreadFlow(
        fileMapper,
        runInfo,
        sarifCF.threadFlows[tFIndex],
        `${indexId}_${tFIndex}`
      ).then((threadFlow: ThreadFlow) => {
        codeFlow.threads.push(threadFlow);
      });
    }

    return codeFlow;
  }

  /**
   * Creates the ThreadFlow object from the passed in sarif threadflow object
   * @param fileMapper The file mapper used to map the URI locations to a valid local path.
   * @param runInfo The run the thread flow belongs to.
   * @param sarifTF the sarif threadflow object to be processed
   * @param indexId The id based on the index in the codeflow array and threadflow array(ex: "1_1")
   */
  export async function createThreadFlow(
    fileMapper: FileMapper,
    runInfo: RunInfo,
    sarifTF: sarif.ThreadFlow,
    indexId: string
  ): Promise<ThreadFlow> {
    const threadFlow: ThreadFlow = {
      id: sarifTF.id,
      lvlsFirstStepIsNested: 0,
      message: undefined,
      steps: [],
    };

    if (sarifTF.message !== undefined) {
      threadFlow.message = Utilities.parseSarifMessage(sarifTF.message).text;
    }

    for (let index: number = 0; index < sarifTF.locations.length; index++) {
      await CodeFlowFactory.createCodeFlowStep(
        fileMapper,
        runInfo,
        sarifTF.locations[index],
        sarifTF.locations[index + 1],
        `${indexId}_${index}`,
        index + 1
      ).then((step: CodeFlowStep) => {
        threadFlow.steps.push(step);
      });
    }

    // additional processing once we have all of the steps processed
    let hasUndefinedNestingLevel: boolean = false;
    let hasZeroNestingLevel: boolean = false;
    for (const index of threadFlow.steps.keys()) {
      threadFlow.steps[index].beforeIcon = CodeFlowFactory.getBeforeIcon(
        index,
        threadFlow
      );

      // flag if step has undefined or 0 nestingLevel values
      if (threadFlow.steps[index].nestingLevel === -1) {
        hasUndefinedNestingLevel = true;
      } else if (threadFlow.steps[index].nestingLevel === 0) {
        hasZeroNestingLevel = true;
      }
    }

    threadFlow.lvlsFirstStepIsNested = CodeFlowFactory.getLevelsFirstStepIsNested(
      threadFlow.steps[0],
      hasUndefinedNestingLevel,
      hasZeroNestingLevel
    );

    return threadFlow;
  }

  /**
   * Creates the CodeFlowStep object from the passed in sarif CodeFlowLocation object
   * @param fileMapper The file mapper used to map the URI locations to a valid local path.
   * @param runInfo The run the code flow step belongs to.
   * @param tFLoc the ThreadFlowLocation that needs to be processed
   * @param nextTFLoc the next ThreadFlowLocation, it's nesting level is used to determine if isCall or isReturn
   * @param indexId The id based on the index in the codeflow, threadflow and locations arrays (ex: "0_2_1")
   * @param stepNumber The 1 based number that's used for displaying the step in the viewer
   */
  export async function createCodeFlowStep(
    fileMapper: FileMapper,
    runInfo: RunInfo,
    tFLocOrig: sarif.ThreadFlowLocation,
    nextTFLocOrig: sarif.ThreadFlowLocation,
    indexId: string,
    stepNumber: number
  ): Promise<CodeFlowStep> {
    let tFLoc: sarif.ThreadFlowLocation = tFLocOrig;
    if (tFLoc.index !== undefined) {
      const lookedUpLoc:
        | sarif.ThreadFlowLocation
        | undefined = threadFlowLocations.get(`${runInfo.id}_${tFLoc.index}`);
      if (lookedUpLoc) {
        tFLoc = lookedUpLoc;
      }
    }

    let isParentFlag: boolean = false;
    let isLastChildFlag: boolean = false;
    if (nextTFLocOrig) {
      let nextTFLoc: sarif.ThreadFlowLocation = nextTFLocOrig;
      if (nextTFLoc.index !== undefined) {
        const lookedUpLoc:
          | sarif.ThreadFlowLocation
          | undefined = threadFlowLocations.get(
          `${runInfo.id}_${nextTFLoc.index}`
        );
        if (lookedUpLoc) {
          nextTFLoc = lookedUpLoc;
        }
      }

      if (
        tFLoc.nestingLevel !== undefined &&
        nextTFLoc.nestingLevel !== undefined
      ) {
        if (
          tFLoc.nestingLevel < nextTFLoc.nestingLevel ||
          (tFLoc.nestingLevel === undefined &&
            nextTFLoc.nestingLevel !== undefined)
        ) {
          isParentFlag = true;
        } else if (
          tFLoc.nestingLevel > nextTFLoc.nestingLevel ||
          (tFLoc.nestingLevel !== undefined &&
            nextTFLoc.nestingLevel === undefined)
        ) {
          isLastChildFlag = true;
        }
      }
    }

    let loc: Location | undefined;
    let message: Message | undefined;
    if (tFLoc && tFLoc.location) {
      loc = await LocationFactory.create(fileMapper, runInfo, tFLoc.location);
      message = Utilities.parseSarifMessage(tFLoc.location.message);
    }

    let messageText: string;
    if (message !== undefined && message.text !== undefined) {
      messageText = message.text;
    } else if (isLastChildFlag) {
      messageText = "[return call]";
    } else {
      messageText = "[no description]";
    }

    const messageWithStepText: string = `Step ${stepNumber}: ${messageText}`;

    const command: Command = {
      arguments: [indexId],
      command: sendCFSelectionToExplorerCommand,
      title: messageWithStepText,
    };

    let nestingLevelValue: number | undefined = tFLoc.nestingLevel;
    if (nestingLevelValue === undefined) {
      nestingLevelValue = -1;
    }

    const step: CodeFlowStep = {
      beforeIcon: undefined,
      codeLensCommand: command,
      importance: tFLoc.importance || "important",
      isLastChild: isLastChildFlag,
      isParent: isParentFlag,
      location: loc,
      message: messageText,
      messageWithStep: messageWithStepText,
      nestingLevel: nestingLevelValue,
      state: tFLoc.state,
      stepId: tFLoc.executionOrder,
      traversalId: indexId,
    };

    return step;
  }

  /**
   * Figures out which beforeIcon to assign to this step, returns full path to icon or undefined if no icon
   * @param index Index of the step to determine the before icon of
   * @param threadFlow threadFlow that contains the step
   */
  export function getBeforeIcon(
    index: number,
    threadFlow: ThreadFlow
  ): string | undefined {
    let iconName: string | undefined;
    const step: CodeFlowStep = threadFlow.steps[index];
    if (step.isParent) {
      iconName = "call-no-return.svg";
      for (
        let nextIndex: number = index + 1;
        nextIndex < threadFlow.steps.length;
        nextIndex++
      ) {
        if (threadFlow.steps[nextIndex].nestingLevel <= step.nestingLevel) {
          iconName = "call-with-return.svg";
          break;
        }
      }
    } else if (step.isLastChild) {
      iconName = "return-no-call.svg";
      if (step.nestingLevel !== -1) {
        for (let prevIndex: number = index - 1; prevIndex >= 0; prevIndex--) {
          if (threadFlow.steps[prevIndex].nestingLevel < step.nestingLevel) {
            iconName = "return-with-call.svg";
            break;
          }
        }
      }
    }

    if (iconName) {
      iconName = Utilities.IconsPath + iconName;
    }

    return iconName;
  }

  /**
   * Calculates the amount of nesting the first step has
   * @param step the first step in the threadflow
   * @param hasUndefinedNL flag for if the thread has any steps that are nested level of 0
   * @param hasZeroNL flag for if the thread has any steps that are nested level of 0
   */
  export function getLevelsFirstStepIsNested(
    step: CodeFlowStep,
    hasUndefinedNL: boolean,
    hasZeroNL: boolean
  ): number {
    const firstNestingLevel: number = step.nestingLevel;
    let lvlsFirstStepIsNested: number = 0;
    switch (firstNestingLevel) {
      case -1:
        break;
      case 0:
        if (hasUndefinedNL === true) {
          lvlsFirstStepIsNested++;
        }
        break;
      default:
        if (hasUndefinedNL === true) {
          lvlsFirstStepIsNested++;
        }
        if (hasZeroNL === true) {
          lvlsFirstStepIsNested++;
        }
        lvlsFirstStepIsNested = lvlsFirstStepIsNested + (firstNestingLevel - 1);
        break;
    }

    return lvlsFirstStepIsNested;
  }
}
