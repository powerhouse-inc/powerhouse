import {
  clearVoice,
  reducer,
  setVoice,
  setVoiceVocabulary,
  updateVoice,
  utils,
} from "document-models/brand-sheet/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

describe("Voice operations", () => {
  it("sets the voice block with empty vocabulary, then updates and sets vocabulary", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      setVoice({
        qualities: ["plain", "warm"],
        guidance: "Speak to members, not users.",
      }),
    );
    expect(doc.state.global.voice).toEqual({
      qualities: ["plain", "warm"],
      guidance: "Speak to members, not users.",
      vocabulary: { prefer: [], avoid: [] },
    });

    doc = reducer(doc, updateVoice({ guidance: "Speak plainly to members." }));
    expect(doc.state.global.voice?.guidance).toBe("Speak plainly to members.");

    doc = reducer(
      doc,
      setVoiceVocabulary({
        prefer: ["members", "the group"],
        avoid: ["users", "customers"],
      }),
    );
    expect(doc.state.global.voice?.vocabulary).toEqual({
      prefer: ["members", "the group"],
      avoid: ["users", "customers"],
    });
  });

  it("rejects update/vocabulary before voice is set, and clears voice", () => {
    let doc = utils.createDocument();
    expect(
      failure(() => reducer(doc, updateVoice({ guidance: "x" }))),
    ).toBeTruthy();
    expect(
      failure(() =>
        reducer(doc, setVoiceVocabulary({ prefer: [], avoid: [] })),
      ),
    ).toBeTruthy();

    doc = reducer(doc, setVoice({ qualities: ["plain"], guidance: "g" }));
    doc = reducer(doc, clearVoice({}));
    expect(doc.state.global.voice).toBeNull();
  });
});
