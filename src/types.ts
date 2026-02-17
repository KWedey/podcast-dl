/** A podcast feed subscription */
export interface Feed {
  /** RSS feed URL */
  url: string;
  /** Human-readable podcast name (from RSS <title> or user-provided) */
  name: string;
  /** ISO 8601 timestamp when feed was added */
  addedAt: string;
}

/** Download history: maps feed URL to array of downloaded episode GUIDs */
export type DownloadHistory = Record<string, string[]>;

/** A parsed podcast episode from an RSS feed */
export interface Episode {
  /** Episode GUID from RSS <guid> element */
  guid: string;
  /** Episode title from RSS <title> element */
  title: string;
  /** Audio file URL from RSS <enclosure url="..."> */
  audioUrl: string;
  /** MIME type from RSS <enclosure type="..."> */
  mimeType: string;
  /** Publication date as ISO 8601 string, parsed from RSS <pubDate> */
  publishedAt: string | null;
}
