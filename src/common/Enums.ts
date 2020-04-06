/*!
 * Copyright (c) ShiftLeft Inc. All Rights Reserved.
 */

/** Updating this also requires an update to the matching enum in the explorer folder */
export enum MessageType {
  AttachmentSelectionChange,
  CodeFlowSelectionChange,
  ExplorerLoaded,
  NewDiagnostic,
  ResultsListColumnToggled,
  ResultsListDataSet,
  ResultsListFilterApplied,
  ResultsListFilterCaseToggled,
  ResultsListGroupChanged,
  ResultsListResultSelected,
  ResultsListSortChanged,
  SourceLinkClicked,
  TabChanged,
  VerbosityChanged,
  PerformScan,
  ScanCompleted,
}

export const enum SeverityLevelOrder {
  error,
  warning,
  note,
  none,
}

export const enum KindOrder {
  notApplicable,
  pass,
  fail,
  review,
  open,
}

export const enum BaselineOrder {
  new,
  updated,
  unchanged,
  absent,
}
