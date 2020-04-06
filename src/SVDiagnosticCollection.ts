/*!
 * Copyright (c) ShiftLeft Inc. All Rights Reserved.
 */
import { SVDiagnosticFactory } from "./factories/SVDiagnosticFactory";
import {
  Diagnostic,
  DiagnosticCollection,
  DiagnosticSeverity,
  languages,
  Range,
  Uri,
  Event,
  EventEmitter,
  Disposable,
  workspace,
  TextDocument,
} from "vscode";
import { RunInfo } from "./common/Interfaces";
import { Utilities } from "./Utilities";
import { SarifViewerVsCodeDiagnostic } from "./SarifViewerDiagnostic";
import { FileMapper } from "./FileMapper";

export interface SVDiagnosticsChangedEvent {
  diagnostics: SarifViewerVsCodeDiagnostic[];
  type: "Add" | "Remove" | "Synchronize";
}

/**
 * Manager for the Diagnostic Collection contianing the sarif result diagnostics
 * Allows us to control which diagnostics we send to the Problems panel, so we can show a custom message on max entries
 * And lets us easily try to map those that weren't mapped previously
 */
export class SVDiagnosticCollection implements Disposable {
  private disposables: Disposable[] = [];

  private static MaxDiagCollectionSize: number;

  private readonly diagnosticCollection: DiagnosticCollection;

  /**
   * The 'mapped' collection cotnains diagnostics that have had their file-paths mapped to a local path.
   * The 'unmapped' collection, have not had their file paths mapped.
   */
  private readonly mappedIssuesCollection: Map<
    string,
    SarifViewerVsCodeDiagnostic[]
  > = new Map<string, SarifViewerVsCodeDiagnostic[]>();
  private readonly unmappedIssuesCollection: Map<
    string,
    SarifViewerVsCodeDiagnostic[]
  > = new Map<string, SarifViewerVsCodeDiagnostic[]>();
  private runInfoCollection: RunInfo[] = [];

  private diagnosticCollectionChangedEventEmitter: EventEmitter<
    SVDiagnosticsChangedEvent
  > = new EventEmitter<SVDiagnosticsChangedEvent>();

  public get diagnosticCollectionChanged(): Event<SVDiagnosticsChangedEvent> {
    return this.diagnosticCollectionChangedEventEmitter.event;
  }

  public constructor(private readonly fileMapper: FileMapper) {
    this.disposables.push(this.diagnosticCollectionChangedEventEmitter);
    this.diagnosticCollection = languages.createDiagnosticCollection(
      SVDiagnosticCollection.name
    );
    this.disposables.push(this.diagnosticCollection);

    // @ts-ignore: _maxDiagnosticsPerFile does exist on the DiagnosticCollection object
    SVDiagnosticCollection.MaxDiagCollectionSize = this.diagnosticCollection._maxDiagnosticsPerFile - 1;

    this.disposables.push(
      this.fileMapper.onMappingChanged(this.mappingChanged.bind(this))
    );
    this.disposables.push(this.fileMapper);

    this.disposables.push(
      workspace.onDidCloseTextDocument(this.onDocumentClosed.bind(this))
    );
  }

  public dispose(): void {
    Disposable.from(...this.disposables).dispose();
    this.disposables = [];
  }

  /**
   * Syncs the collection of Diagnostics added with those displayed in the problems panel.
   */
  public syncDiagnostics(): void {
    this.diagnosticCollection.clear();

    this.addToDiagnosticCollection(this.mappedIssuesCollection);
    this.addToDiagnosticCollection(this.unmappedIssuesCollection);

    this.diagnosticCollectionChangedEventEmitter.fire({
      diagnostics: [],
      type: "Synchronize",
    });
  }

  /**
   * Adds the diagnostic to the collection of diagnostics, separates them into mapped and unmapped diagnostics
   * After you finish adding all of the new diagnostics, call syncDiagnostics to get them added to the problems panel
   * @param issue diagnostic to add to the problems panel
   */
  public add(issue: SarifViewerVsCodeDiagnostic): void {
    if (
      issue.resultInfo.assignedLocation &&
      issue.resultInfo.assignedLocation.mapped
    ) {
      this.addToCollection(this.mappedIssuesCollection, issue);
    } else {
      this.addToCollection(this.unmappedIssuesCollection, issue);
    }

    this.diagnosticCollectionChangedEventEmitter.fire({
      diagnostics: [issue],
      type: "Add",
    });
  }

  /**
   * Adds a RunInfo object to the runinfo collection and returns it's id
   * @param runInfo RunInfo object to add to the collection
   */
  public addRunInfoAndCalculateId(runInfo: RunInfo): number {
    // The reason the ID is not just the length of the run info collection is because items
    // are added and removed from the collection.
    const runInfoIdentifier: number =
      this.runInfoCollection.length !== 0
        ? this.runInfoCollection[this.runInfoCollection.length - 1].id + 1
        : 0;
    this.runInfoCollection.push(runInfo);
    return runInfoIdentifier;
  }

  /**
   * Clears the Problems panel of diagnostics associated with the SARIF Extension
   * and clears all of the Diagnostics that have been added
   */
  public clear(): void {
    this.diagnosticCollection.clear();
    this.mappedIssuesCollection.clear();
    this.unmappedIssuesCollection.clear();
    this.runInfoCollection.length = 0;
  }

  /**
   * Gets a flat array of all the unmapped diagnostics
   */
  public getAllUnmappedDiagnostics(): SarifViewerVsCodeDiagnostic[] {
    const unmapped: SarifViewerVsCodeDiagnostic[] = [];
    this.unmappedIssuesCollection.forEach((value) => {
      unmapped.push(...value);
    });

    return unmapped;
  }

  /**
   * Gets and returns a Result based on it's run and result Id
   * @param resultId Id of the result
   * @param runId Id of the run the results from
   */
  public getResultInfo(
    resultId: number,
    runId: number
  ): SarifViewerVsCodeDiagnostic | undefined {
    for (const unmappedIssuesCollection of this.unmappedIssuesCollection.values()) {
      const result:
        | SarifViewerVsCodeDiagnostic
        | undefined = unmappedIssuesCollection.find(
        (diag: SarifViewerVsCodeDiagnostic) =>
          diag.resultInfo.runId === runId && diag.resultInfo.id === resultId
      );
      if (result) {
        return result;
      }
    }

    for (const mappedIssuesCollection of this.mappedIssuesCollection.values()) {
      const result:
        | SarifViewerVsCodeDiagnostic
        | undefined = mappedIssuesCollection.find(
        (diag: SarifViewerVsCodeDiagnostic) =>
          diag.resultInfo.runId === runId && diag.resultInfo.id === resultId
      );
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  /**
   * Returns the runinfo from the runinfo collection corresponding to the id
   * @param id Id of the runinfo to return
   */
  public getRunInfo(id: number): RunInfo | undefined {
    return this.runInfoCollection.find((runInfo) => {
      return runInfo.id === id;
    });
  }

  /**
   * Callback to handle whenever a mapping in the FileMapper changes
   * Goes through the diagnostics and tries to remap their locations, if not able to it gets left in the unmapped
   * Also goes through the codeflow locations, to update the locations
   */
  public async mappingChanged(): Promise<void> {
    // There is an interesting issue here that may either be by design or
    // overlooked. If the remapping "fails" for something that has already been mapped
    // does it become unmapped? The result of tryToRemapLocations is being ignored.
    for (const issues of this.mappedIssuesCollection.values()) {
      for (const issue of issues) {
        await SVDiagnosticFactory.tryToRemapLocations(this.fileMapper, issue);
      }
    }

    for (const [
      key,
      unmappedIssues,
    ] of this.unmappedIssuesCollection.entries()) {
      const remainingUnmappedIssues: SarifViewerVsCodeDiagnostic[] = [];
      for (const unmappedIssue of unmappedIssues) {
        const remapped: boolean = await SVDiagnosticFactory.tryToRemapLocations(
          this.fileMapper,
          unmappedIssue
        );
        if (remapped) {
          this.add(unmappedIssue);
        } else {
          remainingUnmappedIssues.push(unmappedIssue);
        }
      }

      if (remainingUnmappedIssues.length === 0) {
        this.unmappedIssuesCollection.delete(key);
      } else {
        this.unmappedIssuesCollection.set(key, remainingUnmappedIssues);
      }
    }

    this.syncDiagnostics();
  }

  /**
   * Itterates through the issue collections and removes any results that originated from the file
   * @param path Path (including file) of the file that has the runs to be removed
   */
  public removeRuns(path: string): void {
    const runsToRemove: number[] = [];
    for (let i: number = this.runInfoCollection.length - 1; i >= 0; i--) {
      if (this.runInfoCollection[i].sarifFileFullPath === path) {
        runsToRemove.push(this.runInfoCollection[i].id);
        this.runInfoCollection.splice(i, 1);
      }
    }

    this.removeResults(runsToRemove, this.mappedIssuesCollection);
    this.removeResults(runsToRemove, this.unmappedIssuesCollection);
    this.syncDiagnostics();
  }

  /**
   * Does the actual action of adding the passed in diagnostic into the passed in collection
   * @param collection dictionary to add the diagnostic to
   * @param issue diagnostic that needs to be added to dictionary
   */
  private addToCollection(
    collection: Map<string, SarifViewerVsCodeDiagnostic[]>,
    issue: SarifViewerVsCodeDiagnostic
  ): void {
    if (
      !issue.resultInfo.assignedLocation ||
      !issue.resultInfo.assignedLocation.uri
    ) {
      return;
    }

    const key: string = Utilities.getFsPathWithFragment(
      issue.resultInfo.assignedLocation.uri
    );
    const diagnostics:
      | SarifViewerVsCodeDiagnostic[]
      | undefined = collection.get(key);

    if (diagnostics) {
      diagnostics.push(issue);
    } else {
      collection.set(key, [issue]);
    }
  }

  /**
   * Does the work to add the collection into the DiagnosticsCollection used for displaying in the problems panel
   * Handles if the size is larger then the max we stop 1 short and add our custom message as the final diagnostic
   * @param collection dictionary of diagnostics that need to be added to the panel
   */
  private addToDiagnosticCollection(
    collection: Map<string, SarifViewerVsCodeDiagnostic[]>
  ): void {
    for (const issues of collection.values()) {
      let diags: Diagnostic[];
      if (
        !issues[0].resultInfo.assignedLocation ||
        !issues[0].resultInfo.assignedLocation.uri
      ) {
        continue;
      }

      const key: Uri = issues[0].resultInfo.assignedLocation.uri;
      if (issues.length > SVDiagnosticCollection.MaxDiagCollectionSize) {
        const msg: string = `Only displaying ${SVDiagnosticCollection.MaxDiagCollectionSize} of the total
                    ${issues.length} results in the SARIF log.`;
        const maxReachedDiag: Diagnostic = new Diagnostic(
          new Range(0, 0, 0, 0),
          msg,
          DiagnosticSeverity.Error
        );
        maxReachedDiag.code = "SARIFReader";
        maxReachedDiag.source = "SARIFViewer";
        diags = [maxReachedDiag].concat(
          issues.slice(0, SVDiagnosticCollection.MaxDiagCollectionSize)
        );
      } else {
        diags = issues;
      }

      this.diagnosticCollection.set(key, diags);
    }
  }

  /**
   * Removes the results associated with the runids to be removed from the collection
   * @param runsToRemove array of runids to be removed
   * @param collection diagnostic collection to search for matching runids
   */
  private removeResults(
    runsToRemove: number[],
    collection: Map<string, SarifViewerVsCodeDiagnostic[]>
  ): void {
    let diagnosticsRemoved: SarifViewerVsCodeDiagnostic[] = [];
    for (const key of collection.keys()) {
      const diagnostics: SarifViewerVsCodeDiagnostic[] =
        collection.get(key) || [];
      for (let i: number = diagnostics.length - 1; i >= 0; i--) {
        for (const runId of runsToRemove) {
          if (diagnostics[i].resultInfo.runId === runId) {
            diagnosticsRemoved = diagnosticsRemoved.concat(
              diagnostics.splice(i, 1)
            );
            break;
          }
        }
      }

      if (diagnostics.length === 0) {
        collection.delete(key);
      } else {
        collection.set(key, diagnostics);
      }
    }

    if (diagnosticsRemoved.length > 0) {
      this.diagnosticCollectionChangedEventEmitter.fire({
        diagnostics: diagnosticsRemoved,
        type: "Remove",
      });
    }
  }

  /**
   * When a sarif document closes we need to clear all of the list of issues and reread the open sarif docs
   * Can't selectivly remove issues becuase the issues don't have a link back to the sarif file it came from
   * @param doc document that was closed
   */
  public onDocumentClosed(doc: TextDocument): void {
    if (Utilities.isSarifFile(doc)) {
      this.removeRuns(doc.fileName);
    }
  }
}
