import { download, type Work } from './model';
export function documentContent(w: Work): {
  title: string;
  sections: { title: string; body: string }[];
} {
  if (w.kind === 'resume') {
    const r = w.resume;
    const sections = [
      { title: r.name || '기본정보', body: [r.email, r.phone, r.intro].filter(Boolean).join('\n') },
    ];
    const order =
      r.template === '경력 중심형'
        ? ['경력', '프로젝트·활동', '스킬', '학력', '자격·교육', '기타']
        : r.template === '신입 중심형'
          ? ['학력', '프로젝트·활동', '스킬', '자격·교육', '경력', '기타']
          : r.sections.map((s) => s.name);
    for (const name of order) {
      const s = r.sections.find((s) => s.name === name)!;
      if (s.enabled)
        sections.push({
          title: s.name,
          body: s.rows
            .map((x) => [x.title, x.period, x.detail].filter(Boolean).join('\n'))
            .join('\n\n'),
        });
    }
    return { title: '이력서', sections };
  }
  if (w.kind === 'interview')
    return {
      title: '면접 연습 기록',
      sections: w.interview.map((q, i) => ({ title: `${i + 1}. ${q.question}`, body: q.answer })),
    };
  return {
    title: '자기소개서',
    sections: w.letters.map((l) => ({ title: l.title, body: l.body })),
  };
}
async function createDocx(w: Work): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = await import('docx');
  const data = documentContent(w);
  const children = [
    new Paragraph({ text: data.title, heading: HeadingLevel.TITLE }),
    ...(w.application.company && w.kind !== 'resume'
      ? [new Paragraph({ text: `${w.application.company} · ${w.application.role}` })]
      : []),
  ];
  if (w.kind === 'resume' && w.resume.photo) {
    const bytes = new Uint8Array(await (await fetch(w.resume.photo)).arrayBuffer());
    const image = await createImageBitmap(new Blob([bytes]));
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: bytes,
            type: w.resume.photo.includes('image/png') ? 'png' : 'jpg',
            transformation: { width: 90, height: (90 * image.height) / image.width },
          }),
        ],
      }),
    );
    image.close();
  }
  for (const s of data.sections) {
    children.push(new Paragraph({ text: s.title, heading: HeadingLevel.HEADING_1 }));
    for (const line of s.body.split('\n'))
      children.push(
        new Paragraph({ children: [new TextRun(line)], spacing: { after: 120, line: 340 } }),
      );
  }
  return Packer.toBlob(
    new Document({
      styles: {
        default: { document: { run: { font: '맑은 고딕', size: 22, color: '000000' } } },
        paragraphStyles: [
          {
            id: 'Title',
            name: 'Title',
            basedOn: 'Normal',
            run: { color: '000000', size: 38, bold: true },
            paragraph: { spacing: { after: 300 } },
          },
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            run: { color: '000000', size: 28, bold: true },
            paragraph: { keepNext: true, spacing: { before: 280, after: 180 } },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 12240, height: 15840 },
              margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
            },
          },
          children,
        },
      ],
    }),
  );
}
async function createPdf(w: Work): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib');
  const fontkit = (await import('@pdf-lib/fontkit')).default;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const response = await fetch('/fonts/NanumGothic-Regular.ttf');
  if (!response.ok) throw new Error('한글 글꼴을 불러오지 못했어요. 다시 시도해 주세요.');
  const font = await pdf.embedFont(await response.arrayBuffer(), { subset: false });
  let page = pdf.addPage([612, 792]);
  let y = 736;
  const data = documentContent(w);
  const draw = (text: string, size = 11) => {
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const ch of Array.from(paragraph.replace(/\t/g, '    '))) {
        let c = ch;
        try {
          font.encodeText(c);
        } catch {
          c = '□';
        }
        if (font.widthOfTextAtSize(line + c, size) > 500) {
          if (y < 60) {
            page = pdf.addPage([612, 792]);
            y = 736;
          }
          page.drawText(line, { x: 56, y, size, font, color: rgb(0.1, 0.14, 0.14) });
          y -= size * 1.65;
          line = '';
        }
        line += c;
      }
      if (y < 60) {
        page = pdf.addPage([612, 792]);
        y = 736;
      }
      page.drawText(line, { x: 56, y, size, font });
      y -= size * 1.65;
    }
  };
  draw(data.title, 23);
  y -= 18;
  if (w.kind === 'resume' && w.resume.photo) {
    const raw = new Uint8Array(await (await fetch(w.resume.photo)).arrayBuffer());
    const img = w.resume.photo.includes('image/png')
      ? await pdf.embedPng(raw)
      : await pdf.embedJpg(raw);
    const h = (80 * img.height) / img.width;
    page.drawImage(img, { x: 56, y: y - h, width: 80, height: h });
    y -= h + 20;
  }
  for (const s of data.sections) {
    if (y < 110) {
      page = pdf.addPage([612, 792]);
      y = 736;
    }
    draw(s.title, 14);
    y -= 6;
    draw(s.body);
    y -= 22;
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${i + 1} / ${pages.length}`, { x: 285, y: 30, size: 9, font }),
  );
  return new Blob([new Uint8Array(await pdf.save())], { type: 'application/pdf' });
}
export async function exportFile(w: Work, format: 'docx' | 'pdf') {
  download(
    await (format === 'docx' ? createDocx(w) : createPdf(w)),
    `스토리담이음-${w.kind}.${format}`,
  );
}
