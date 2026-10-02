'use strict';

// Picks which loaded check files to run. `files` is the full list, each
// `{id, checks}`; `names` are the file ids named on the command line. An
// empty `names` means "run everything".
export function selectCheckFiles(files, names) {
  if (!names || names.length === 0) return files;
  return files.filter((file) => names.includes(file.id));
}

// Names on the command line that don't match any loaded file, so the caller
// can fail loudly instead of silently running a subset of what was asked
// for.
export function unknownNames(files, names) {
  if (!names || names.length === 0) return [];
  const ids = new Set(files.map((file) => file.id));
  return names.filter((name) => !ids.has(name));
}
