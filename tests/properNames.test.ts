import {
  highlightProperNames,
  properNamesFor,
} from "../src/lib/properNames";

describe("proper-name highlighting", () => {
  it("deduplicates annotations and prefers the longest match", () => {
    expect(properNamesFor("Zhang;Zhang Xin;Zhang;")).toEqual([
      "Zhang Xin",
      "Zhang",
    ]);
    expect(
      highlightProperNames(
        "Hola, me llamo Zhang Xin.",
        "Zhang;Zhang Xin;Xin",
      ),
    ).toEqual([
      { text: "Hola, me llamo ", properName: false },
      { text: "Zhang Xin", properName: true },
      { text: ".", properName: false },
    ]);
  });

  it("highlights Hanzi within a sentence and respects Latin word boundaries", () => {
    expect(highlightProperNames("我叫王芳。", "王芳")).toEqual([
      { text: "我叫", properName: false },
      { text: "王芳", properName: true },
      { text: "。", properName: false },
    ]);
    expect(highlightProperNames("Lugar y Lu", "Lu")).toEqual([
      { text: "Lugar y ", properName: false },
      { text: "Lu", properName: true },
    ]);
  });

  it("leaves unannotated text unchanged", () => {
    expect(highlightProperNames("你好", "")).toEqual([
      { text: "你好", properName: false },
    ]);
  });
});
