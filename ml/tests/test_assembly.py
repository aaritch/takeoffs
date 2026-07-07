"""Dataset assembly (P4-05): opt-out, benchmark-leak exclusion, provenance, deterministic versioning."""

from takeoff_ml.datasets import assemble_dataset, FeedbackExample


def fx(fid, org, *, family="classify", disc="CONCRETE", cls="SLAB", action="ACCEPT", key=None, ver="m1"):
    return FeedbackExample(
        feedback_id=fid,
        org_id=org,
        model_family=family,
        discipline=disc,
        label_class=cls,
        action=action,
        model_version=ver,
        source_key=key,
    )


def test_opted_out_org_is_absent_from_the_dataset():
    feedback = [
        fx("f1", "org-keep", key="k1"),
        fx("f2", "org-out", key="k2"),
        fx("f3", "org-out", key="k3"),
        fx("f4", "org-keep", key="k4"),
    ]
    ds = assemble_dataset(feedback, version="v1", opted_out_orgs=["org-out"])

    keys = ds.source_keys()
    assert keys == {"k1", "k4"}
    # Verifiably absent: no example and no provenance mentions the opted-out org.
    assert all(p.org_id != "org-out" for p in ds.manifest.provenance)
    assert ds.manifest.excluded_opted_out == 2
    assert ds.manifest.included_count == 2


def test_benchmark_examples_never_enter_training():
    feedback = [fx("f1", "o", key="shared"), fx("f2", "o", key="train-only")]
    ds = assemble_dataset(feedback, version="v1", benchmark_keys={"shared"})

    assert ds.source_keys() == {"train-only"}
    assert ds.manifest.excluded_benchmark == 1


def test_non_label_actions_are_counted_but_not_examples():
    feedback = [
        fx("f1", "o", key="k1", action="ACCEPT"),
        fx("f2", "o", key="k2", action="REJECT"),
        fx("f3", "o", key="k3", action="ADD_MISSED"),
    ]
    ds = assemble_dataset(feedback, version="v1")

    assert ds.source_keys() == {"k1", "k3"}
    assert ds.manifest.excluded_non_label == 1


def test_provenance_records_source_and_originating_version():
    ds = assemble_dataset([fx("f1", "org-a", key="k1", ver="classify-2.1.0")], version="v1")
    (prov,) = ds.manifest.provenance
    assert prov.source_key == "k1"
    assert prov.feedback_id == "f1"
    assert prov.org_id == "org-a"
    assert prov.model_version == "classify-2.1.0"


def test_counts_break_down_by_family_discipline_and_class():
    feedback = [
        fx("f1", "o", family="classify", disc="CONCRETE", cls="SLAB", key="k1"),
        fx("f2", "o", family="classify", disc="CONCRETE", cls="FOOTING", key="k2"),
        fx("f3", "o", family="symbols", disc="ELECTRICAL", cls="OUTLET", key="k3"),
    ]
    m = assemble_dataset(feedback, version="v1").manifest
    assert m.counts_by_family == {"classify": 2, "symbols": 1}
    assert m.counts_by_discipline == {"CONCRETE": 2, "ELECTRICAL": 1}
    assert m.counts_by_class == {"SLAB": 1, "FOOTING": 1, "OUTLET": 1}


def test_versioning_is_deterministic_and_order_independent():
    a = [fx("f1", "o", key="k1"), fx("f2", "o", key="k2")]
    b = list(reversed(a))
    ha = assemble_dataset(a, version="v7").manifest.content_hash
    hb = assemble_dataset(b, version="v7").manifest.content_hash
    hc = assemble_dataset(a, version="v8").manifest.content_hash
    assert ha == hb  # same content + version → same id, regardless of input order
    assert ha != hc  # a different version → a different id


def test_duplicate_keys_collapse_to_one_example():
    feedback = [fx("f1", "o", key="dup"), fx("f2", "o", key="dup")]
    ds = assemble_dataset(feedback, version="v1")
    assert ds.manifest.included_count == 1
