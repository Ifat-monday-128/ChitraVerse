-- Additive and rerunnable: existing accounts, posts and catalog data are retained.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE community_post ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE community_post ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS community_comment (
  comment_id SERIAL PRIMARY KEY,
  post_id INT NOT NULL REFERENCES community_post(post_id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK(length(trim(content)) BETWEEN 1 AND 2000),
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_community_comment_post ON community_comment(post_id,comment_id);
CREATE TABLE IF NOT EXISTS community_report (
  report_id SERIAL PRIMARY KEY,
  post_id INT REFERENCES community_post(post_id) ON DELETE SET NULL,
  reporter_id INT REFERENCES users(user_id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK(reason IN ('Spam','Harassment','Hate or abusive content','Inappropriate content','Misinformation','Other')),
  explanation TEXT NOT NULL DEFAULT '' CHECK(length(explanation)<=2000),
  status TEXT NOT NULL DEFAULT 'Open' CHECK(status IN ('Open','Under Review','Escalated','Resolved','Dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_open ON community_report(post_id,reporter_id) WHERE status IN ('Open','Under Review','Escalated');
CREATE INDEX IF NOT EXISTS idx_report_queue ON community_report(status,report_id);
CREATE TABLE IF NOT EXISTS moderation_action (
  action_id SERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
  target_type TEXT NOT NULL,
  target_id INT NOT NULL,
  report_id INT REFERENCES community_report(report_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_target ON moderation_action(target_type,target_id,action_id);
CREATE TABLE IF NOT EXISTS admin_notification (
  notification_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  report_id INT NOT NULL REFERENCES community_report(report_id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id,report_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON admin_notification(user_id,notification_id);
ALTER TABLE media_cast_crew ADD COLUMN IF NOT EXISTS character_name TEXT;
ALTER TABLE media_cast_crew ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;
ALTER TABLE awards ADD COLUMN IF NOT EXISTS result TEXT CHECK(result IN ('Won','Nominated'));
ALTER TABLE awards ADD COLUMN IF NOT EXISTS recipient TEXT;
