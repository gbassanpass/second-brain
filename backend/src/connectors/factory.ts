import { resolve } from 'node:path';
import type { ContentConnector } from './base.js';
import { ManualUploadConnector } from './manual.js';

export type ConnectorKind = 'manual';

export interface CreateConnectorOptions {
  /** Override the base dir for the manual connector. Defaults to <repo>/data/<creatorSlug>. */
  manualBaseDir?: string;
  /** Used by the default `manualBaseDir` resolution (`<repo>/data/<creatorSlug>`). */
  creatorSlug?: string;
  /** Defaults to the monorepo root resolved from this file. */
  repoRoot?: string;
}

export function createContentConnector(
  kind: ConnectorKind,
  options: CreateConnectorOptions = {},
): ContentConnector {
  switch (kind) {
    case 'manual': {
      const repoRoot = options.repoRoot ?? resolve(new URL('../../../', import.meta.url).pathname);
      const baseDir =
        options.manualBaseDir ?? resolve(repoRoot, 'data', options.creatorSlug ?? 'fausto');
      return new ManualUploadConnector({ baseDir });
    }
  }
}
