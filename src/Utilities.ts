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

import * as fs from "fs";
import * as path from "path";
import * as sarif from "sarif";
import * as os from "os";
import * as vscode from "vscode";
import { Location, Message, RunInfo, FixChange } from "./common/Interfaces";
import MarkdownIt = require("markdown-it");

/**
 * Class that holds utility functions for use in different classes
 */
export class Utilities {
  private static extensionContext: vscode.ExtensionContext | undefined;

  public static initialize(extensionContext: vscode.ExtensionContext): void {
    Utilities.extensionContext = extensionContext;
  }

  public static readonly configSection = "shiftleft-scan";

  public static get IconsPath(): string {
    if (!Utilities.extensionContext) {
      throw new Error("The utilities were not properly initialized");
    }

    if (!Utilities.iconsPath) {
      Utilities.iconsPath = Utilities.extensionContext.asAbsolutePath(
        "/resources/icons/"
      );
    }

    return Utilities.iconsPath;
  }

  /**
   * Calculates the duration between the start and end times
   * @param start string representing the start time in utc format
   * @param end string representing the end time in utc format
   */
  public static calcDuration(start?: string, end?: string): string | undefined {
    if (!start || !end) {
      return undefined;
    }

    let duration: string = "";

    const diff: number = new Date(end).getTime() - new Date(start).getTime();
    if (diff > 0) {
      const msDiff: number = diff % 1000;
      const sDiff: number = Math.floor((diff / 1000) % 60);
      const mDiff: number = Math.floor((diff / 60000) % 60);
      const hDiff: number = Math.floor(diff / 3600000);

      if (hDiff > 0) {
        const label: string = hDiff === 1 ? "hr" : "hrs";
        duration = `${hDiff} ${label}`;
      }

      if (mDiff > 0) {
        const label: string = mDiff === 1 ? "min" : "mins";
        duration = `${duration} ${mDiff} ${label}`;
      }

      if (sDiff > 0) {
        const label: string = sDiff === 1 ? "sec" : "secs";
        duration = `${duration} ${sDiff} ${label}`;
      }

      if (msDiff > 0) {
        duration = `${duration} ${msDiff} ms`;
      }

      duration = duration.trim();
    } else {
      duration = `0 ms`;
    }

    return duration;
  }

  /**
   * Combines and returns the uri with it's uriBase, if uriBase is undefined just returns the original uri
   * @param uriPath uri path from sarif file to combine with the base
   * @param uriBase the uriBase as defined in the sarif file
   */
  public static combineUriWithUriBase(
    uriPath: string,
    uriBase?: string
  ): vscode.Uri {
    try {
      if (uriBase) {
        // Let's try strict parsing, meaning the "URI" base will have a scheme (such as file://)
        const baseUri: vscode.Uri = vscode.Uri.parse(uriBase, true);

        // It did, great. Now combine it with the appropriate combination.
        if (
          baseUri.scheme.localeCompare("file", "root", {
            sensitivity: "base",
          }) === 0
        ) {
          const fileUri: vscode.Uri = vscode.Uri.file(uriPath);
          return vscode.Uri.file(path.join(baseUri.fsPath, fileUri.fsPath));
        }

        const uriPathAsUri: vscode.Uri = vscode.Uri.parse(uriPath).with({
          scheme: baseUri.scheme,
        });

        // The 'uriPath" parsed into a URI may indeed have a fragment, which, we will
        // drop as it is not supported in SARF.
        return baseUri.with({
          path: path.posix.join(baseUri.path, uriPathAsUri.path), // Use the POSIX separator for "/"
        });
      } else {
        // Let's try strict parsing, meaning the "URI" base will have a scheme (such as file://)
        return vscode.Uri.parse(uriPath, true);
      }
    } catch (e) {
      // URI malformed will happen if the combined path is something like %srcroot%/folder/file.ext
      // if it's malformed in the next if statement we force it to file schema
    }

    return uriBase !== undefined
      ? vscode.Uri.file(path.normalize(path.join(uriBase, uriPath)))
      : vscode.Uri.file(path.normalize(uriPath));
  }

  /**
   * Creates a readonly file at the path with the contents specified
   * If the file already exists method will delete that file and replace it with the new one
   * @param path path to create the file in
   * @param contents content to add to the file after created
   */
  public static createReadOnlyFile(directory: string, contents: string): void {
    if (fs.existsSync(directory)) {
      fs.unlinkSync(directory);
    }

    fs.writeFileSync(directory, contents, { mode: 0o444 /*readonly*/ });
  }

  /**
   * expands out all of the nested based ids to get a flat dictionary of base ids
   * @param baseIds all of the base ids that need to be expanded out
   */
  public static expandBaseIds(baseIds?: {
    [key: string]: sarif.ArtifactLocation;
  }): { [key: string]: string } | undefined {
    if (!baseIds) {
      return undefined;
    }

    const expandedBaseIds: { [key: string]: string } = {};

    for (const id in baseIds) {
      if (baseIds.hasOwnProperty(id)) {
        expandedBaseIds[id] = this.expandBaseId(id, baseIds);
      }
    }

    return expandedBaseIds;
  }

  /**
   * joins two paths adding a / if needed
   * @param start Start of path
   * @param end End of path
   */
  public static joinPath(start: string, end: string): string {
    let joined: string = start;

    if (joined !== "" && joined[joined.length - 1] !== "/") {
      joined = joined + "/";
    }

    if (end[0] === "/") {
      joined = joined + end.slice(1);
    } else {
      joined = joined + end;
    }

    return joined;
  }

  /**
   * Generates a folder path matching original path in the temp location and returns the path with the file included
   * @param filePath original file path, to recreate in the temp location
   * @param hashValue optional hash value to add to the path
   */
  public static generateTempPath(filePath: string, hashValue?: string): string {
    const pathObj: path.ParsedPath = path.parse(filePath);
    let basePath: string = path.join(
      Utilities.SarifViewerTempDir,
      hashValue || ""
    );
    let tempPath: string = Utilities.makeFileNameSafe(
      path.join(
        pathObj.dir.replace(pathObj.root, ""),
        path.win32.basename(filePath)
      )
    );
    tempPath = tempPath.split("#").join(""); // remove the #s to not create a folder structure with fragments
    basePath = Utilities.createDirectoryInTemp(basePath);
    tempPath = path.posix.join(basePath, tempPath);

    return tempPath;
  }

  /**
   * This will remove illegal characters from a file name
   * Illegal characters include \/:*?"<>|
   * @param fileName file name to modify
   */
  public static makeFileNameSafe(fileName: string): string {
    return fileName.replace(/[/\\?%*:|"<>]/g, "-");
  }

  /**
   * This will convert the passed in uri into a common format
   * ex: file:///d:/test/ and d:\\test will return d:\test
   * @param uri path to a directory
   */
  public static getDisplayableRootpath(uri: vscode.Uri): string {
    if (uri.scheme === "file") {
      return Utilities.getFsPathWithFragment(uri);
    } else {
      return path.normalize(uri.toString(true));
    }
  }

  /**
   * Returns the fspath include the fragment if it exists
   * @param uri uri to pull the fspath and fragment from
   */
  public static getFsPathWithFragment(uri: vscode.Uri): string {
    let fragment: string = "";
    if (uri.fragment !== "") {
      fragment = "#" + uri.fragment;
    }

    return path.normalize(uri.fsPath + fragment);
  }

  /**
   * gets the uriBase from this runs uriBaseIds, if no match: returns uriBaseId, if no uriBaseId: returns undefined
   * @param runInfo The run the file location belongs to.
   * @param fileLocation File Location which contains the uriBaseId
   */
  public static getUriBase(
    runInfo: RunInfo,
    fileLocation?: sarif.ArtifactLocation
  ): string | undefined {
    if (!fileLocation || !fileLocation.uriBaseId) {
      return undefined;
    }

    let expandedBaseUri: string | undefined;

    const expoandedBaseIdsForRun: { [key: string]: string } | undefined =
      runInfo.expandedBaseIds;
    if (expoandedBaseIdsForRun) {
      expandedBaseUri = expoandedBaseIdsForRun[fileLocation.uriBaseId];
    }

    // This is actually an exceptional condition as it would indicate
    // that the SARIF file had a URI base id that was not mapped properly.
    if (!expandedBaseUri) {
      expandedBaseUri = fileLocation.uriBaseId;
    }

    return expandedBaseUri;
  }

  /**
   * Parses a Sarif Message object and returns the message in string format
   * Supports Embedded links(requires locations) and placeholders
   * @param sarifMessage sarif message object to be parsed
   * @param locations only needed if your message supports embedded links
   */
  public static parseSarifMessage(
    sarifMessage?: sarif.Message,
    locations?: Location[]
  ): Message {
    if (
      sarifMessage &&
      (sarifMessage.markdown !== undefined || sarifMessage.text !== undefined)
    ) {
      let mdText: string | undefined = sarifMessage.markdown;
      let msgText: string | undefined = sarifMessage.text;

      // Insert result specific arguments
      if (sarifMessage.arguments) {
        if (msgText) {
          for (
            let index: number = 0;
            index < sarifMessage.arguments.length;
            index++
          ) {
            msgText = msgText
              .split("{" + index + "}")
              .join(sarifMessage.arguments[index]);
          }
        }
        if (mdText) {
          for (
            let index: number = 0;
            index < sarifMessage.arguments.length;
            index++
          ) {
            mdText = mdText
              .split("{" + index + "}")
              .join(sarifMessage.arguments[index]);
          }
        }
      }

      if (!mdText) {
        mdText = msgText;
      }

      const mdIt: MarkdownIt = new MarkdownIt();

      if (mdText) {
        mdText = mdIt.render(mdText);
        mdText = Utilities.ReplaceLocationLinks(mdText, locations, true);
        mdText = Utilities.unescapeBrackets(mdText);
      }

      if (msgText) {
        msgText = mdIt.renderInline(msgText);
        msgText = Utilities.ReplaceLocationLinks(msgText, locations, false);
        msgText = msgText.replace(Utilities.linkRegEx, (match, p1, p2) => {
          return `${p2}(${p1})`;
        });
        msgText = Utilities.unescapeBrackets(msgText);
        msgText = mdIt.utils.unescapeAll(msgText);
      }

      return { text: msgText, html: mdText };
    }

    return {};
  }

  /**
   * Handles cleaning up the Sarif Viewer temp directory used for temp files (embedded code, converted files, etc.)
   */
  public static removeSarifViewerTempDirectory(): void {
    const tempPath: string = path.join(
      os.tmpdir(),
      Utilities.SarifViewerTempDir
    );
    Utilities.removeDirectoryContents(tempPath);
    fs.rmdirSync(tempPath);
  }

  /**
   * Fixes up file schemed based paths to contain the proper casing for VSCode's URIs which are case sensitive.
   * @param uri The URI for which to fix the casing.
   */
  public static fixUriCasing(uri: vscode.Uri): vscode.Uri {
    // We can only support file-system scheme files.
    // Use "root" locale to indicate invariant language.
    if (uri.scheme.toLocaleUpperCase("root") !== "FILE") {
      return uri;
    }

    let pathPartIndex: number = 0;
    const pathParts: string[] = uri.fsPath.split(path.sep);
    if (pathParts.length < 1) {
      return uri;
    }

    // We assume that the "root" drive is lower-cased which is "usually" the case.
    // There is an windows API
    // [GetLogicalDriveStringsW]
    // (https://docs.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getlogicaldrivestringsw)
    // that we often use in native/C# code to get the proper casing of the driver letter.
    // As far as I know, this doesn't exist in node\javascript land.
    // It is a very rare rare case that the drive letter is uppercase however.
    let fixedPath: string = pathParts[0].toLowerCase() + path.sep;

    while (pathPartIndex + 1 < pathParts.length) {
      const directoryToRead: string = fixedPath;
      const directoryEntries: string[] = fs.readdirSync(directoryToRead);
      const fixedPathPart: string | undefined = directoryEntries.find(
        (directoryEntry) =>
          // Use "undefined" as the locale which means "default for environment" (which
          // in our case is whatever VSCode is running in).
          // We use this compare because file names can be typed in any language.
          directoryEntry.localeCompare(
            pathParts[pathPartIndex + 1],
            undefined,
            { sensitivity: "base" }
          ) === 0
      );
      if (!fixedPathPart) {
        throw new Error(
          `Cannot find path part ${pathParts[pathPartIndex + 1]} of path ${
            uri.fsPath
          }`
        );
      }

      fixedPath = path.join(fixedPath, fixedPathPart);

      pathPartIndex++;
    }

    return vscode.Uri.file(fixedPath);
  }

  private static embeddedRegEx = /(<a href=)"(\d+)">/g;
  private static linkRegEx = /<a.*?href="(.*?)".*?>(.*?)<\/a>/g;
  private static iconsPath: string;
  private static readonly SarifViewerTempDir = "SarifViewerExtension";

  /**
   * Loops through the passed in path's directories and creates the directory structure
   * @param relativePath directory path that needs to be created in temp directory(including temp directory)
   */
  private static createDirectoryInTemp(relativePath: string): string {
    const directories: string[] = relativePath.split(path.sep);
    let createPath: string = os.tmpdir();

    for (const directory of directories) {
      createPath = path.join(createPath, directory);
      try {
        fs.mkdirSync(createPath);
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }
      }
    }

    return createPath;
  }

  /**
   * Recursively expands all of the nested baseids of the base id
   * @param id baseId that needs to be expanded
   * @param baseIds all the base ids
   */
  private static expandBaseId(
    id: string,
    baseIds: { [key: string]: sarif.ArtifactLocation }
  ): string {
    let base: string = "";
    const artifactLocation: sarif.ArtifactLocation | undefined = baseIds[id];
    if (artifactLocation && artifactLocation.uriBaseId) {
      base = Utilities.expandBaseId(artifactLocation.uriBaseId, baseIds);
    }

    return this.joinPath(base, baseIds[id].uri || id);
  }

  /**
   * Recursively removes all of the contents in a directory, including subfolders
   * @param directory directory to remove all contents from
   */
  private static removeDirectoryContents(directory: string): void {
    const contents: string[] = fs.readdirSync(directory);
    for (const content of contents) {
      const contentPath: string = path.join(directory, content);
      if (fs.lstatSync(contentPath).isDirectory()) {
        this.removeDirectoryContents(contentPath);
        fs.rmdirSync(contentPath);
      } else {
        fs.unlinkSync(contentPath);
      }
    }
  }

  /**
   * Replaces links that are location links, that have a digit as the href value
   * @param text Text to parse through and replace location links with the usable link
   * @param locations array of locations to use in replacing the links
   * @param isMd if true the format replaced is as a markdown, if false it returns as if plain text
   */
  private static ReplaceLocationLinks(
    text: string,
    locations: Location[] | undefined,
    isMd: boolean
  ): string {
    if (!locations) {
      return text;
    }

    return text.replace(Utilities.embeddedRegEx, (match, p1, id) => {
      const linkId: number = parseInt(id, 10);
      const location: Location | undefined = locations.find(
        (loc: Location, index: number, obj: Location[]) => {
          return loc && loc.id === linkId;
        }
      );

      if (location && location.uri) {
        if (isMd) {
          const className: string = `class="sourcelink"`;
          const tooltip: string = `title="${location.uri.toString(true)}"`;
          const data: string =
            `data-file="${location.uri.toString(true)}" ` +
            `data-sLine="${location.range.start.line}" ` +
            `data-sCol="${location.range.start.character}" ` +
            `data-eLine="${location.range.end.line}" ` +
            `data-eCol="${location.range.end.character}"`;
          const onClick: string = `onclick="explorerWebview.onSourceLinkClickedBind(event)"`;
          return `${p1}"#0" ${className} ${data} ${tooltip} ${onClick}>`;
        } else {
          return `${p1}"${location.uri.toString(true)}">`;
        }
      } else {
        return match;
      }
    });
  }

  /**
   * Remove the escape '\' characters from before any '[' or ']' characters in the text
   * @param text text to remove the escape characters from
   */
  private static unescapeBrackets(text: string): string {
    return text.split("\\[").join("[").split("\\]").join("]");
  }

  /**
   * Serializes "start" and "stop" properties of VSCode's range as part of the location.
   * That way we can properly type the web view code.
   * @param this Represents the location being serialized.
   * @param key The "key" in the outer object that respresents the location: (i.e. "locationInSarifFile: Location"  - the key is "locationInSarifFile")
   * @param value The current location value.
   */
  // tslint:disable-next-line: no-any
  public static LocationToJson(this: Location, key: any, value: any): any {
    return {
      ...this,
      range: {
        ...this.range,
        start: this.range.start,
        end: this.range.end,
      },
    };
  }

  /**
   * Serializes "start" and "stop" properties of VSCode's range as part of the location.
   * That way we can properly type the web view code.
   * @param this Represents the FixChange being serialized.
   * @param key The "key" in the outer object that respresents the location: (i.e. "changes: FixChange[]"  - the key is "changes")
   * @param value The current location value.
   */
  // tslint:disable-next-line: no-any
  public static FixChangeToJson(this: FixChange, key: any, value: any): any {
    if (!this.delete) {
      return value;
    }

    return {
      ...this,
      delete: {
        ...this.delete,
        start: this.delete.start,
        end: this.delete.end,
      },
    };
  }

  /**
   * Confirms that the string representring verbosity level is a valid.
   * @param value The string value to confirm.
   */
  public static isThreadFlowImportance(
    value: string
  ): value is sarif.ThreadFlowLocation.importance {
    const allowedKeys: string[] = <sarif.ThreadFlowLocation.importance[]>[
      "essential",
      "important",
      "unimportant",
    ];
    return allowedKeys.indexOf(value) !== -1;
  }

  /**
   * Helper method to check if the document provided is a sarif file
   * @param doc document to check if it's a sarif file
   */
  public static isSarifFile(doc: vscode.TextDocument | string): boolean {
    // SARIF spec says that the file name can end in ".sarif" or ".sarif.json";
    const stringCheck: (stringToCheck: string) => boolean = (stringToCheck) => {
      const stringCheckUpperCase: string = stringToCheck.toLocaleUpperCase(
        "root"
      );
      return (
        stringCheckUpperCase.endsWith(".SARIF") ||
        stringCheckUpperCase.endsWith(".SARIF.JSON")
      );
    };

    if (typeof doc === "string") {
      return stringCheck(doc);
    }

    return doc.languageId === "json" && stringCheck(doc.fileName);
  }
}
