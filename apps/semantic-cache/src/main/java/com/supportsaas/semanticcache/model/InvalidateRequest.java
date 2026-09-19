package com.supportsaas.semanticcache.model;

import jakarta.validation.constraints.NotBlank;

/** Drops every cached answer for one org, optionally bumping its knowledge-base version. */
public record InvalidateRequest(@NotBlank String orgId, boolean bumpKbVersion, String reason) {
}
