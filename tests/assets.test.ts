import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function publicFile(name: string): Buffer {
  return readFileSync(resolve(process.cwd(), "public", name));
}

function pngSize(name: string): [number, number] {
  const image = publicFile(name);
  expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [image.readUInt32BE(16), image.readUInt32BE(20)];
}

function icoSizes(name: string): number[] {
  const icon = publicFile(name);
  const count = icon.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const width = icon[6 + index * 16];
    return width === 0 ? 256 : width;
  });
}

describe("Yuwenke identity assets", () => {
  it("provides the expected raster sizes and multi-resolution favicon", () => {
    expect(pngSize("apple-touch-icon.png")).toEqual([180, 180]);
    expect(pngSize("icon-192.png")).toEqual([192, 192]);
    expect(pngSize("icon-512.png")).toEqual([512, 512]);
    expect(pngSize("yuwenke-mark.png")).toEqual([96, 96]);
    expect(pngSize("favicon-32.png")).toEqual([32, 32]);
    expect(pngSize("og.png")).toEqual([1200, 630]);
    expect(icoSizes("favicon.ico")).toEqual([16, 32, 48]);
  });

  it("uses base-path-safe relative URLs in the web manifest", () => {
    const manifest = JSON.parse(publicFile("site.webmanifest").toString("utf8"));
    expect(manifest.name).toBe("Yuwenke");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
      "icon-192.png",
      "icon-512.png",
    ]);
  });
});
