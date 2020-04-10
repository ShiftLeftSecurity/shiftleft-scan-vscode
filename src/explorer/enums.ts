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

// Enums

/** Updating this also requires an update to the matching enum in the explorer folder */
enum MessageType {
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
}

enum tabNames {
  attachments = "attachmentstab",
  codeflow = "codeflowtab",
  fixes = "fixestab",
  resultinfo = "resultinfotab",
  runinfo = "runinfotab",
  stacks = "stackstab",
}

enum ToggleState {
  collapsed = "collapsed",
  expanded = "expanded",
}

enum TreeClassNames {
  ExpandState,
  Importance,
  VerbosityShowState,
}

enum SeverityTooltip {
  error = "The rule was evaluated, and a serious problem was found.",
  warning = "The rule was evaluated, and a problem was found.",
  note = "A purely informational log entry",
  none = "Severity does not apply to the analysis target.",
}

enum BaselineStateTooltip {
  new = "This result was detected in the current run but was not detected in the baseline run.",
  unchanged = "This result was detected both in the current run and in the baseline run, " +
    "and it did not change between those two runs in any way that the tool considers significant.",
  updated = "This result was detected both in the current run and in the baseline run, " +
    "but it changed between those two runs in a way that the tool considers significant.",
  absent = "This result was detected in the baseline run but was not detected in the current run.",
}

enum KindTooltip {
  notApplicable = "The rule was not evaluated, because it does not apply to the analysis target.",
  pass = "The rule was evaluated, and no problem was found.",
  fail = "The result represents a problem whose severity is specified by the Severity Level property.",
  review = "The result requires review by a human user to decide if it represents a problem.",
  open = "The rule was evaluated, " +
    "and the tool concluded that there was insufficient information to decide whether a problem exists",
  informational = "The rule was evaluated, and the problem is informational.",
}
