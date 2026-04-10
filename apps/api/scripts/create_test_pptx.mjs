import PptxGenJS from "pptxgenjs";
import { writeFileSync } from "fs";

async function createTemplate() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.defineSlideMaster({
    title: "CUSTOM_MASTER",
    background: { color: "1a3c6e" },
    objects: [
      {
        text: {
          text: "TEMPLATE WATERMARK",
          options: {
            x: 0.5, y: 4.8, w: 9, h: 0.4,
            fontSize: 10, color: "5588bb", italic: true,
          },
        },
      },
    ],
  });

  const slide1 = pptx.addSlide({ masterName: "CUSTOM_MASTER" });
  slide1.addText("Template Title Slide", {
    x: 1, y: 1.5, w: 8, h: 1.5,
    fontSize: 36, color: "ffffff", fontFace: "Helvetica",
    bold: true, align: "center",
  });
  slide1.addText("Subtitle here", {
    x: 1, y: 3.2, w: 8, h: 0.8,
    fontSize: 18, color: "aaccee", fontFace: "Helvetica",
    align: "center",
  });

  const slide2 = pptx.addSlide({ masterName: "CUSTOM_MASTER" });
  slide2.addText("Template Content Page", {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 28, color: "ffffff", bold: true,
  });
  slide2.addText("• Point 1\n• Point 2\n• Point 3", {
    x: 0.5, y: 1.5, w: 9, h: 3,
    fontSize: 18, color: "dddddd",
  });

  const buf = await pptx.write({ outputType: "nodebuffer" });
  writeFileSync("/tmp/ppt_test/template.pptx", buf);
  console.log("Created template.pptx");
}

async function createContent() {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";

  const slide1 = pptx.addSlide();
  slide1.addText("My Presentation Title", {
    x: 1, y: 2, w: 8, h: 1.2,
    fontSize: 32, color: "000000", fontFace: "Arial",
    bold: true, align: "center",
  });
  slide1.addText("By Author Name - 2026", {
    x: 1, y: 3.5, w: 8, h: 0.6,
    fontSize: 16, color: "333333", align: "center",
  });

  const slide2 = pptx.addSlide();
  slide2.addText("Chapter 1: Introduction", {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 24, color: "000000", bold: true,
  });
  slide2.addText(
    "This is the main body text of the content presentation.\n\n" +
    "• First important point\n• Second important point\n• Third important point",
    {
      x: 0.5, y: 1.5, w: 9, h: 3.5,
      fontSize: 16, color: "000000",
    }
  );

  const slide3 = pptx.addSlide();
  slide3.addText("Chapter 2: Details", {
    x: 0.5, y: 0.3, w: 9, h: 0.8,
    fontSize: 24, color: "000000", bold: true,
  });
  slide3.addText("More detailed content goes here with additional explanations.", {
    x: 0.5, y: 1.5, w: 9, h: 3.5,
    fontSize: 16, color: "000000",
  });

  const buf = await pptx.write({ outputType: "nodebuffer" });
  writeFileSync("/tmp/ppt_test/content.pptx", buf);
  console.log("Created content.pptx");
}

await createTemplate();
await createContent();
console.log("Test files ready in /tmp/ppt_test/");
