-- DX-POLISH F-DP-02: add deprecated flag to ModelAlias
ALTER TABLE "model_aliases" ADD COLUMN "deprecated" BOOLEAN NOT NULL DEFAULT false;
