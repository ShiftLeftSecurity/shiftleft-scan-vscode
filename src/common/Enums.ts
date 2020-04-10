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
