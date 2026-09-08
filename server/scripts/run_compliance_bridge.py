import sys
import os
import json

def main():
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: python run_compliance_bridge.py <image_path>\n")
        sys.exit(1)

    image_path = sys.argv[1]
    if not os.path.exists(image_path):
        sys.stderr.write(f"Image not found: {image_path}\n")
        sys.exit(1)

    try:
        from src.pipeline import OCRPipeline
        from src.extract.schema import StructuredExtractionResult
        from src.rules.pipeline import run_compliance_pipeline
        from src.rules.classifier import classify_category
        from src.normalize.normalizer import normalize_product_fields
        from src.config import Config
        Config.USE_VLM = True
        Config.VLM_PROVIDER = "real"
    except ImportError as e:
        sys.stderr.write(f"ImportError: {e}\n")
        sys.exit(1)

    try:
        pipeline = OCRPipeline()
        json_out = pipeline.process_image(image_path, save_debug=False)
        structured_data = StructuredExtractionResult.model_validate_json(json_out)

        normalized = normalize_product_fields(structured_data.fields)
        cat_result = classify_category(normalized)

        filename = os.path.basename(image_path)
        warnings = getattr(structured_data, "warnings", [])

        final_report = run_compliance_pipeline(
            product_id=filename,
            normalized_fields=normalized,
            category=cat_result.category,
            sub_category=cat_result.sub_category,
            warnings=warnings, is_low_confidence=(cat_result.status == "LOW_CONFIDENCE")
        )

        # Attach image dimensions so the Node adapter can convert pixel bboxes
        # to percentage coordinates without inventing values.
        try:
            import cv2 as _cv2
            _img = _cv2.imread(image_path)
            if _img is not None:
                _h, _w = _img.shape[:2]
                if isinstance(final_report, dict):
                    final_report["image_width_px"] = _w
                    final_report["image_height_px"] = _h
        except Exception:
            pass  # Non-fatal: Node adapter will omit bbox when dimensions absent

        if isinstance(final_report, dict):
            print(json.dumps(final_report, indent=4))
        else:
            print(final_report.model_dump_json(indent=4))

        sys.exit(0)
    except Exception as e:
        sys.stderr.write(f"Pipeline error: {str(e)}\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
