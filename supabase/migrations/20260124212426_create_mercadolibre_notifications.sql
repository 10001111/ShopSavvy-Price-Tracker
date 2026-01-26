-- Create table to store Mercado Libre webhook notifications
CREATE TABLE IF NOT EXISTS mercadolibre_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource TEXT NOT NULL,
    user_id BIGINT NOT NULL,
    topic TEXT NOT NULL,
    application_id BIGINT,
    attempts INTEGER DEFAULT 1,
    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    raw_payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_ml_notifications_topic ON mercadolibre_notifications(topic);
CREATE INDEX idx_ml_notifications_user_id ON mercadolibre_notifications(user_id);
CREATE INDEX idx_ml_notifications_processed ON mercadolibre_notifications(processed);
CREATE INDEX idx_ml_notifications_created_at ON mercadolibre_notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE mercadolibre_notifications ENABLE ROW LEVEL SECURITY;

-- Allow the service role to insert (for Edge Functions)
CREATE POLICY "Service role can insert notifications"
    ON mercadolibre_notifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Allow service role to read and update
CREATE POLICY "Service role can manage notifications"
    ON mercadolibre_notifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE mercadolibre_notifications IS 'Stores webhook notifications from Mercado Libre API';
