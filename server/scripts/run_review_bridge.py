import sys
import os
import json
import argparse

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("raw_json_path", help="Path to raw JSON extraction")
    parser.add_argument("--overrides", dest="overrides", help="JSON string of field overrides")
    args = parser.parse_args()

    raw_path = args.raw_json_path
    overrides_str = args.overrides

    if not os.path.exists(raw_path):
        sys.stderr.write(f"Raw extraction not found: {raw_path}\n")
        sys.exit(1)

    try:
        from src.extract.schema import StructuredExtractionResult, ExtractedField
        from src.rules.pipeline import run_compliance_pipeline
        from src.rules.classifier import classify_category
        from src.normalize.normalizer import normalize_product_fields
    except ImportError as e:
        sys.stderr.write(f"ImportError: {e}\n")
        sys.exit(1)

    try:
        with open(raw_path, "r", encoding="utf-8") as f:
            json_in = f.read()

        structured_data = StructuredExtractionResult.model_validate_json(json_in)

        # Apply overrides
        overrides = {}
        if overrides_str:
            try:
                overrides = json.loads(overrides_str)
            except Exception as e:
                sys.stderr.write(f"Failed to parse overrides JSON: {e}\n")

        # 1. Map keys
        if "mfg_date" in overrides:
            overrides["manufacturing_date"] = overrides.pop("mfg_date")

        # 2. Derive import status
        if "country_of_origin" in overrides:
            coo = overrides["country_of_origin"].strip()
            if coo.upper() == "INDIA":
                overrides["import_status"] = "DOMESTIC"
            elif coo:
                overrides["import_status"] = "IMPORTED"

        # 3. Handle nested consumer care
        if "consumer_care" in overrides:
            cc = overrides.pop("consumer_care")
            if isinstance(cc, dict):
                for k, v in cc.items():
                    overrides[f"consumer_care.{k}"] = v
            elif isinstance(cc, str):
                if "@" in cc and "." in cc:
                    overrides["consumer_care.email"] = cc
                else:
                    overrides["consumer_care.phone"] = cc

        # We recursively apply overrides to any ExtractedField that matches the key
        def apply_overrides(obj, prefix=""):
            if hasattr(obj, "__fields__"):
                for key in obj.__fields__:
                    val = getattr(obj, key)
                    full_key = f"{prefix}.{key}" if prefix else key
                    if isinstance(val, ExtractedField):
                        ovr_key = None
                        if full_key in overrides:
                            ovr_key = full_key
                        elif key in overrides and prefix == "":
                            ovr_key = key

                        if ovr_key:
                            # Preserve original value
                            val.original_value = val.extracted_value
                            # Set effective override
                            val.extracted_value = overrides[ovr_key]
                            val.officer_override = overrides[ovr_key]
                            # Optionally set status to FOUND if it was NOT_FOUND
                            if val.status != "FOUND":
                                val.status = "FOUND"
                    else:
                        apply_overrides(val, prefix=full_key)

        apply_overrides(structured_data.fields)

        normalized = normalize_product_fields(structured_data.fields)
        cat_result = classify_category(normalized)

        # filename was originally the image path basename, but we only have raw_path here
        # we can extract the original image path from structured_data
        filename = os.path.basename(structured_data.image_path) if structured_data.image_path else "unknown"
        warnings = getattr(structured_data, "warnings", [])

        final_report = run_compliance_pipeline(
            product_id=filename,
            normalized_fields=normalized,
            category=cat_result.category,
            sub_category=cat_result.sub_category,
            warnings=warnings, is_low_confidence=(cat_result.status == "LOW_CONFIDENCE")
        )

        pi = {
            "barcode": structured_data.fields.barcode.extracted_value if structured_data.fields.barcode.status == "FOUND" else None,
            "product_name": structured_data.fields.product_name.extracted_value if structured_data.fields.product_name.status == "FOUND" else None,
            "manufacturer": structured_data.fields.manufacturer.name.extracted_value if structured_data.fields.manufacturer.name.status == "FOUND" else None,
        }

        if hasattr(structured_data, "product_intelligence") and structured_data.product_intelligence:
            if "brand" in structured_data.product_intelligence:
                pi["brand"] = structured_data.product_intelligence["brand"]

        if isinstance(final_report, dict):
            final_report["product_intelligence"] = pi
            print(json.dumps(final_report, indent=4))
        else:
            out_dict = final_report.model_dump()
            out_dict["product_intelligence"] = pi
            print(json.dumps(out_dict, indent=4))

        sys.exit(0)
    except Exception as e:
        sys.stderr.write(f"Pipeline error: {str(e)}\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
