def test_index_article_chunks_and_stores(fake_vector_store):
    n_chunks = fake_vector_store.index_article(
        "org_a", "art_1", "Password reset",
        "To reset your password, go to Settings > Security and click Reset Password.",
        [],
    )
    assert n_chunks >= 1


def test_retrieval_is_scoped_to_org(fake_vector_store):
    fake_vector_store.index_article("org_a", "art_1", "Password reset", "Reset your password in Settings.", [])
    fake_vector_store.index_article("org_b", "art_2", "Password reset (org B)", "Org B resets via mobile app.", [])

    results_a = fake_vector_store.retrieve("org_a", "how do I reset my password", top_k=5)
    assert len(results_a) > 0
    assert all(r.metadata["org_id"] == "org_a" for r in results_a), "org_b data leaked into org_a results"

    results_b = fake_vector_store.retrieve("org_b", "password", top_k=5)
    assert len(results_b) > 0
    assert all(r.metadata["org_id"] == "org_b" for r in results_b), "org_a data leaked into org_b results"


def test_delete_article_removes_it_from_retrieval(fake_vector_store):
    fake_vector_store.index_article("org_a", "art_1", "Password reset", "Reset your password in Settings.", [])
    fake_vector_store.index_article("org_a", "art_2", "Billing", "Invoices are generated monthly.", [])

    fake_vector_store.delete_article("art_1")

    remaining = fake_vector_store.retrieve("org_a", "password reset billing", top_k=10)
    remaining_ids = {r.metadata["article_id"] for r in remaining}
    assert "art_1" not in remaining_ids


def test_delete_article_before_any_index_does_not_crash(fake_vector_store):
    # Regression test: delete_article used to crash if the Qdrant collection
    # hadn't been created yet (ensure_collection was missing from its path).
    fake_vector_store.delete_article("never-indexed")


def test_reindexing_an_article_replaces_old_chunks(fake_vector_store):
    fake_vector_store.index_article("org_a", "art_1", "Old title", "Old content about refunds.", [])
    fake_vector_store.index_article("org_a", "art_1", "New title", "Completely different content about shipping.", [])

    results = fake_vector_store.retrieve("org_a", "shipping", top_k=5)
    titles = {r.metadata["title"] for r in results}
    assert "New title" in titles
    assert "Old title" not in titles
