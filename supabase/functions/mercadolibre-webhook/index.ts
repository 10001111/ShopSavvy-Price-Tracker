// Mercado Libre Webhook Handler for ShopSavvy Price Tracker
// This function receives notifications from Mercado Libre API

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// Mercado Libre notification topics
type MLTopic =
  | "orders_v2"        // Order updates
  | "items"            // Item/listing updates
  | "questions"        // Questions from buyers
  | "messages"         // Messages
  | "payments"         // Payment updates
  | "shipments"        // Shipping updates
  | "claims"           // Claims/disputes
  | "item_competition" // Price competition alerts

interface MercadoLibreNotification {
  resource: string      // e.g., "/orders/123456789"
  user_id: number       // Seller's ML user ID
  topic: MLTopic        // Notification type
  application_id: number
  attempts: number
  sent: string          // ISO timestamp
  received: string      // ISO timestamp
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    })
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    // Parse the webhook payload
    const notification: MercadoLibreNotification = await req.json()

    console.log("Received ML notification:", JSON.stringify(notification))

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Store the notification in the database
    const { data, error } = await supabase
      .from("mercadolibre_notifications")
      .insert({
        resource: notification.resource,
        user_id: notification.user_id,
        topic: notification.topic,
        application_id: notification.application_id,
        attempts: notification.attempts,
        sent_at: notification.sent,
        received_at: notification.received,
        processed: false,
        raw_payload: notification,
      })

    if (error) {
      console.error("Error storing notification:", error)
      // Still return 200 to prevent ML from retrying
      // We'll handle the error internally
    }

    // Process based on topic (you can extend this)
    switch (notification.topic) {
      case "items":
        console.log(`Item update: ${notification.resource}`)
        // TODO: Fetch item details and update price tracking
        break
      case "orders_v2":
        console.log(`Order update: ${notification.resource}`)
        break
      case "questions":
        console.log(`New question: ${notification.resource}`)
        break
      default:
        console.log(`Received ${notification.topic} notification`)
    }

    // IMPORTANT: Always return 200 OK
    // Mercado Libre expects a 200 response within 500ms
    // Otherwise it will retry the notification
    return new Response(
      JSON.stringify({ success: true, message: "Notification received" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )

  } catch (error) {
    console.error("Webhook error:", error)

    // Return 200 even on error to prevent infinite retries
    // Log the error for debugging
    return new Response(
      JSON.stringify({ success: true, message: "Notification acknowledged" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
})
