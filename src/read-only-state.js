import { StateEffect, StateField } from "@codemirror/state";

/**
 * State effect used to toggle the editor's read-only mode.
 */
export const setReadOnly = StateEffect.define();

/**
 * State field that tracks whether the editor is in read-only mode.
 * When true, rendered blocks (charts, networks, todos, etc.) stay in
 * their interactive widget form and the underlying text cannot be edited.
 */
export const readOnlyState = StateField.define({
  create() {
    return false;
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setReadOnly)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * Returns true if the transaction changes the read-only state.
 */
export function readOnlyChanged(tr) {
  for (const effect of tr.effects) {
    if (effect.is(setReadOnly)) return true;
  }
  return false;
}
