-- Jenis dokumen SPMB kini dinamis per sekolah (admission_document_type); kunci bawaan diseragamkan.
UPDATE application_document SET kind = 'kk' WHERE kind = 'family_card';
--> statement-breakpoint
UPDATE application_document SET kind = 'previous_certificate' WHERE kind = 'diploma';
