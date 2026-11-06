-- Additive PostgreSQL migration for the existing public works/chapters/pages/favorites tables.
-- Run against an empty or existing database; this script does not delete rows or tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS formato VARCHAR(36) NOT NULL DEFAULT 'manga',
  ADD COLUMN IF NOT EXISTS cover_file_id VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS create_by VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.works ALTER COLUMN "createdAt" SET DEFAULT NOW();
CREATE INDEX IF NOT EXISTS works_create_by_index ON public.works(create_by);

ALTER TABLE public.chapters
  ADD COLUMN IF NOT EXISTS language VARCHAR(16) NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS create_by VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.chapters ALTER COLUMN "createdAt" SET DEFAULT NOW();
CREATE INDEX IF NOT EXISTS chapters_work_id_index ON public.chapters("workId");
CREATE INDEX IF NOT EXISTS chapters_create_by_index ON public.chapters(create_by);

ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS original_name VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_file_id VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS format VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS pages_chapter_id_index ON public.pages("chapterId");

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  auth_id VARCHAR(64) NOT NULL UNIQUE,
  appwrite_id VARCHAR(64) UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON public.users(LOWER(email));

CREATE TABLE IF NOT EXISTS public.moderation_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_auth_id VARCHAR(64) NOT NULL,
  motivos TEXT NOT NULL,
  idiomas_preferencia VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_requests_user_index ON public.moderation_requests(user_auth_id);

CREATE TABLE IF NOT EXISTS public.work_requests (
  id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_auth_id VARCHAR(64) NOT NULL,
  moderator_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  moderator_auth_id VARCHAR(64),
  nome_obra VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL DEFAULT '',
  sinopse TEXT NOT NULL,
  cover_url VARCHAR(2048) NOT NULL DEFAULT '',
  cover_file_id VARCHAR(255) NOT NULL DEFAULT '',
  gender VARCHAR(255) NOT NULL DEFAULT '',
  formato VARCHAR(16) NOT NULL DEFAULT 'manga',
  status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS work_requests_user_index ON public.work_requests(user_auth_id);
CREATE INDEX IF NOT EXISTS work_requests_moderator_index ON public.work_requests(moderator_auth_id);

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry_index ON public.auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS public.password_recovery_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  challenge_id VARCHAR(64) NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_recovery_expiry_index ON public.password_recovery_tokens(expires_at);
