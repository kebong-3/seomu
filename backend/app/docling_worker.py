"""Optional local Docling adapter; no public HF Space upload."""
import json
import sys
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, TesseractCliOcrOptions


def main():
    options=PdfPipelineOptions()
    options.do_ocr=True
    options.do_table_structure=True
    options.ocr_options=TesseractCliOcrOptions(lang=sys.argv[2].split('+'))
    result = DocumentConverter(format_options={InputFormat.PDF:PdfFormatOption(pipeline_options=options)}).convert(sys.argv[1])
    blocks = []
    for item, _level in result.document.iterate_items():
        prov = getattr(item, 'prov', [])
        page = prov[0].page_no if prov else None
        locator = f'페이지 {page}' if page else 'Docling 블록'
        if hasattr(item, 'export_to_markdown') and 'table' in str(getattr(item, 'label', '')).lower():
            text = item.export_to_markdown(doc=result.document)
        else:
            text = getattr(item, 'text', '')
        if text:
            blocks.append({'locator': locator, 'text': text, 'kind': 'paragraph', 'cells': []})
    print(json.dumps({'blocks': blocks, 'warnings': ['Docling 추출 결과는 원본과 대조하세요.']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
