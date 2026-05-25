export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          cancel_token: string
          cancelled_at: string | null
          finalized_at: string | null
          reason: string | null
          requested_at: string
          scheduled_for: string
          user_id: string
        }
        Insert: {
          cancel_token: string
          cancelled_at?: string | null
          finalized_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for: string
          user_id: string
        }
        Update: {
          cancel_token?: string
          cancelled_at?: string | null
          finalized_at?: string | null
          reason?: string | null
          requested_at?: string
          scheduled_for?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_display_snapshot: string | null
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: number
          ip_hash: string | null
          target_id: string | null
          target_type: string | null
          visibility: Database["public"]["Enums"]["audit_visibility"]
        }
        Insert: {
          action: string
          actor_display_snapshot?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          ip_hash?: string | null
          target_id?: string | null
          target_type?: string | null
          visibility?: Database["public"]["Enums"]["audit_visibility"]
        }
        Update: {
          action?: string
          actor_display_snapshot?: string | null
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: number
          ip_hash?: string | null
          target_id?: string | null
          target_type?: string | null
          visibility?: Database["public"]["Enums"]["audit_visibility"]
        }
        Relationships: []
      }
      batch_flush_log: {
        Row: {
          action_count: number
          created_at: string
          duration_ms: number
          fail_count: number
          id: number
          success_count: number
          user_id: string
        }
        Insert: {
          action_count?: number
          created_at?: string
          duration_ms?: number
          fail_count?: number
          id?: number
          success_count?: number
          user_id: string
        }
        Update: {
          action_count?: number
          created_at?: string
          duration_ms?: number
          fail_count?: number
          id?: number
          success_count?: number
          user_id?: string
        }
        Relationships: []
      }
      broadcast_notifications: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          body: string | null
          category: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          link: string | null
          recipient_count: number
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          body?: string | null
          category?: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          link?: string | null
          recipient_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          body?: string | null
          category?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          link?: string | null
          recipient_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          depth: number
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
          video_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          depth?: number
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          video_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          depth?: number
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          video_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
        ]
      }
      category_ancestors: {
        Row: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Insert: {
          ancestor_id: string
          depth: number
          descendant_id: string
        }
        Update: {
          ancestor_id?: string
          depth?: number
          descendant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_ancestors_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_ancestors_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "category_ancestors_ancestor_id_fkey"
            columns: ["ancestor_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "category_ancestors_descendant_id_fkey"
            columns: ["descendant_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_ancestors_descendant_id_fkey"
            columns: ["descendant_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "category_ancestors_descendant_id_fkey"
            columns: ["descendant_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
        ]
      }
      creators: {
        Row: {
          channel_url: string | null
          country: string | null
          created_at: string
          description: string | null
          fetched_at: string | null
          handle: string | null
          id: string
          subscriber_count: number | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_count: number | null
          youtube_channel_id: string
        }
        Insert: {
          channel_url?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          fetched_at?: string | null
          handle?: string | null
          id?: string
          subscriber_count?: number | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_count?: number | null
          youtube_channel_id: string
        }
        Update: {
          channel_url?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          fetched_at?: string | null
          handle?: string | null
          id?: string
          subscriber_count?: number | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_count?: number | null
          youtube_channel_id?: string
        }
        Relationships: []
      }
      feed_sections: {
        Row: {
          created_at: string
          cycle: Json
          enabled: boolean
          filters: Json
          id: string
          is_template: boolean
          layout: string
          name: string
          owner_id: string | null
          position: number
          refresh_minutes: number
          size: number
          sort: string
          source: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle?: Json
          enabled?: boolean
          filters?: Json
          id?: string
          is_template?: boolean
          layout?: string
          name: string
          owner_id?: string | null
          position?: number
          refresh_minutes?: number
          size?: number
          sort?: string
          source: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle?: Json
          enabled?: boolean
          filters?: Json
          id?: string
          is_template?: boolean
          layout?: string
          name?: string
          owner_id?: string | null
          position?: number
          refresh_minutes?: number
          size?: number
          sort?: string
          source?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "feed_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_entries: {
        Row: {
          prev_rank: number | null
          rank: number
          score: number
          snapshot_id: string
          submission_count: number
          suggest_count: number
          video_id: string
        }
        Insert: {
          prev_rank?: number | null
          rank: number
          score: number
          snapshot_id: string
          submission_count?: number
          suggest_count?: number
          video_id: string
        }
        Update: {
          prev_rank?: number | null
          rank?: number
          score?: number
          snapshot_id?: string
          submission_count?: number
          suggest_count?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "leaderboard_entries_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "leaderboard_entries_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_snapshots: {
        Row: {
          created_at: string
          id: string
          next_refresh_at: string
          scope_type: string
          scope_value: string | null
          tier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          next_refresh_at: string
          scope_type: string
          scope_value?: string | null
          tier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          next_refresh_at?: string
          scope_type?: string
          scope_value?: string | null
          tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_snapshots_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_tiers: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          name: string
          refresh_minutes: number
          size: number
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          refresh_minutes?: number
          size: number
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          refresh_minutes?: number
          size?: number
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      mv_refresh_log: {
        Row: {
          duration_ms: number
          error: string | null
          id: number
          ok: boolean
          rows_affected: number | null
          triggered_at: string
          view_name: string
        }
        Insert: {
          duration_ms: number
          error?: string | null
          id?: number
          ok?: boolean
          rows_affected?: number | null
          triggered_at?: string
          view_name: string
        }
        Update: {
          duration_ms?: number
          error?: string | null
          id?: number
          ok?: boolean
          rows_affected?: number | null
          triggered_at?: string
          view_name?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      permissions: {
        Row: {
          area: string
          created_at: string
          description: string | null
          key: string
        }
        Insert: {
          area: string
          created_at?: string
          description?: string | null
          key: string
        }
        Update: {
          area?: string
          created_at?: string
          description?: string | null
          key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          audit_privacy_mode: Database["public"]["Enums"]["audit_privacy_mode"]
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          id: string
          recommendation_opt_in: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          audit_privacy_mode?: Database["public"]["Enums"]["audit_privacy_mode"]
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id: string
          recommendation_opt_in?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          audit_privacy_mode?: Database["public"]["Enums"]["audit_privacy_mode"]
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          id?: string
          recommendation_opt_in?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limit_events: {
        Row: {
          action: string
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      recommendation_settings: {
        Row: {
          id: boolean
          updated_at: string
          updated_by: string | null
          weights: Json
        }
        Insert: {
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          weights?: Json
        }
        Update: {
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          weights?: Json
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason_text: string
          reporter_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["report_status"]
          updated_at: string
          video_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason_text: string
          reporter_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          video_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason_text?: string
          reporter_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
          updated_at?: string
          video_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission_key: string
          role_id: string
        }
        Insert: {
          permission_key: string
          role_id: string
        }
        Update: {
          permission_key?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          anonymous: boolean
          content_warnings: string[]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          note: string | null
          proposed_category_ids: string[]
          proposed_tag_ids: string[]
          status: Database["public"]["Enums"]["submission_status"]
          submitter_id: string
          suggested_categories: string[]
          suggested_tags: string[]
          updated_at: string
          video_id: string | null
          youtube_id: string | null
          youtube_url: string
        }
        Insert: {
          anonymous?: boolean
          content_warnings?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          note?: string | null
          proposed_category_ids?: string[]
          proposed_tag_ids?: string[]
          status?: Database["public"]["Enums"]["submission_status"]
          submitter_id: string
          suggested_categories?: string[]
          suggested_tags?: string[]
          updated_at?: string
          video_id?: string | null
          youtube_id?: string | null
          youtube_url: string
        }
        Update: {
          anonymous?: boolean
          content_warnings?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          note?: string | null
          proposed_category_ids?: string[]
          proposed_tag_ids?: string[]
          status?: Database["public"]["Enums"]["submission_status"]
          submitter_id?: string
          suggested_categories?: string[]
          suggested_tags?: string[]
          updated_at?: string
          video_id?: string | null
          youtube_id?: string | null
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "submissions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "submissions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          approved: boolean
          created_at: string
          id: string
          is_platform_tag: boolean
          name: string
          slug: string
          source: Database["public"]["Enums"]["tag_source"]
          tier: Database["public"]["Enums"]["tag_tier"]
          usage_count: number
        }
        Insert: {
          approved?: boolean
          created_at?: string
          id?: string
          is_platform_tag?: boolean
          name: string
          slug: string
          source?: Database["public"]["Enums"]["tag_source"]
          tier?: Database["public"]["Enums"]["tag_tier"]
          usage_count?: number
        }
        Update: {
          approved?: boolean
          created_at?: string
          id?: string
          is_platform_tag?: boolean
          name?: string
          slug?: string
          source?: Database["public"]["Enums"]["tag_source"]
          tier?: Database["public"]["Enums"]["tag_tier"]
          usage_count?: number
        }
        Relationships: []
      }
      user_broadcast_reads: {
        Row: {
          broadcast_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          broadcast_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          broadcast_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_broadcast_reads_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcast_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      user_category_pins: {
        Row: {
          category_id: string
          pinned_at: string
          sort_order: number
          user_id: string
        }
        Insert: {
          category_id: string
          pinned_at?: string
          sort_order?: number
          user_id: string
        }
        Update: {
          category_id?: string
          pinned_at?: string
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_category_pins_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_category_pins_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "user_category_pins_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
        ]
      }
      user_feed_dedup: {
        Row: {
          cycle_started_at: string
          seen_ids: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          cycle_started_at?: string
          seen_ids?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          cycle_started_at?: string
          seen_ids?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_feed_state: {
        Row: {
          last_cycled_at: string
          section_id: string
          session_seed: number
          user_id: string
        }
        Insert: {
          last_cycled_at?: string
          section_id: string
          session_seed: number
          user_id: string
        }
        Update: {
          last_cycled_at?: string
          section_id?: string
          session_seed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feed_state_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "feed_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          granted_by: string | null
          role_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          role_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_video_status: {
        Row: {
          created_at: string
          status: Database["public"]["Enums"]["user_list_status"]
          user_id: string
          video_id: string
        }
        Insert: {
          created_at?: string
          status: Database["public"]["Enums"]["user_list_status"]
          user_id: string
          video_id: string
        }
        Update: {
          created_at?: string
          status?: Database["public"]["Enums"]["user_list_status"]
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_video_status_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "user_video_status_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "user_video_status_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_categories: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          category_id: string
          video_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          category_id: string
          video_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          category_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "video_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "video_categories_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_categories_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_categories_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_submitters: {
        Row: {
          anonymous: boolean
          first_submitted_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          anonymous?: boolean
          first_submitted_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          anonymous?: boolean
          first_submitted_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_submitters_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_submitters_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_submitters_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_suggestions: {
        Row: {
          anonymous: boolean
          created_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          anonymous?: boolean
          created_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          anonymous?: boolean
          created_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_suggestions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_suggestions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_suggestions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tags: {
        Row: {
          assigned_by: Database["public"]["Enums"]["tag_assigned_by"]
          rank: number
          tag_id: string
          video_id: string
        }
        Insert: {
          assigned_by?: Database["public"]["Enums"]["tag_assigned_by"]
          rank?: number
          tag_id: string
          video_id: string
        }
        Update: {
          assigned_by?: Database["public"]["Enums"]["tag_assigned_by"]
          rank?: number
          tag_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_suggested_feed"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "mv_trending"
            referencedColumns: ["video_id"]
          },
          {
            foreignKeyName: "video_tags_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          app_dislike_count: number
          app_like_count: number
          app_watch_count: number
          content_warnings: string[]
          created_at: string
          creator_id: string | null
          curator_note: string | null
          description: string | null
          duration_seconds: number | null
          first_submitted_at: string
          id: string
          is_featured: boolean
          language: string | null
          last_metadata_fetch: string | null
          like_count: number | null
          primary_tag_ids: string[]
          published_at: string | null
          status: Database["public"]["Enums"]["video_status"]
          submission_count: number
          suggest_count: number
          thumbnail_url: string | null
          title: string
          updated_at: string
          view_count: number | null
          youtube_id: string
        }
        Insert: {
          app_dislike_count?: number
          app_like_count?: number
          app_watch_count?: number
          content_warnings?: string[]
          created_at?: string
          creator_id?: string | null
          curator_note?: string | null
          description?: string | null
          duration_seconds?: number | null
          first_submitted_at?: string
          id?: string
          is_featured?: boolean
          language?: string | null
          last_metadata_fetch?: string | null
          like_count?: number | null
          primary_tag_ids?: string[]
          published_at?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          submission_count?: number
          suggest_count?: number
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
          youtube_id: string
        }
        Update: {
          app_dislike_count?: number
          app_like_count?: number
          app_watch_count?: number
          content_warnings?: string[]
          created_at?: string
          creator_id?: string | null
          curator_note?: string | null
          description?: string | null
          duration_seconds?: number | null
          first_submitted_at?: string
          id?: string
          is_featured?: boolean
          language?: string | null
          last_metadata_fetch?: string | null
          like_count?: number | null
          primary_tag_ids?: string[]
          published_at?: string | null
          status?: Database["public"]["Enums"]["video_status"]
          submission_count?: number
          suggest_count?: number
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          view_count?: number | null
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_category_stats: {
        Row: {
          avg_suggest_count: number | null
          category_id: string | null
          name: string | null
          slug: string | null
          top_thumbnails: string[] | null
          video_count: number | null
        }
        Relationships: []
      }
      mv_category_suggest_score: {
        Row: {
          category_id: string | null
          computed_at: string | null
          depth: number | null
          name: string | null
          parent_id: string | null
          score: number | null
          slug: string | null
          suggest_delta_24h: number | null
          suggest_delta_72h: number | null
          total_videos: number | null
          videos_with_suggests: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mv_category_stats"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mv_category_suggest_score"
            referencedColumns: ["category_id"]
          },
        ]
      }
      mv_suggested_feed: {
        Row: {
          first_submitted_at: string | null
          suggest_count: number | null
          video_id: string | null
        }
        Relationships: []
      }
      mv_trending: {
        Row: {
          engage_24h: number | null
          suggest_24h: number | null
          suggest_72h: number | null
          trending_score_24h: number | null
          trending_score_72h: number | null
          video_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      categories_compute_depth: {
        Args: { _parent_id: string }
        Returns: number
      }
      categories_reparent: {
        Args: { _id: string; _new_parent_id: string }
        Returns: undefined
      }
      has_permission: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      refresh_mv: { Args: { _name: string }; Returns: Json }
      sync_video_primary_tag_ids: {
        Args: { _video_id: string }
        Returns: undefined
      }
    }
    Enums: {
      audit_privacy_mode: "anonymous" | "public"
      audit_visibility: "internal" | "staff" | "public"
      notification_type:
        | "submission_approved"
        | "submission_rejected"
        | "role_changed"
        | "wishlisted_creator_new_video"
        | "video_entered_top_n"
        | "suggestion_reached_tier"
        | "admin_broadcast"
        | "audit_mode_ack"
        | "deletion_grace_reminder"
      report_status: "open" | "reviewed" | "dismissed"
      submission_status:
        | "pending"
        | "approved"
        | "rejected"
        | "duplicate"
        | "invalid"
      tag_assigned_by: "system" | "user" | "admin"
      tag_source: "platform" | "sciencedirect" | "youtube_api" | "user"
      tag_tier: "primary" | "secondary" | "internal"
      user_list_status: "wishlist" | "liked" | "disliked" | "watched"
      video_status: "pending" | "approved" | "rejected" | "removed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      audit_privacy_mode: ["anonymous", "public"],
      audit_visibility: ["internal", "staff", "public"],
      notification_type: [
        "submission_approved",
        "submission_rejected",
        "role_changed",
        "wishlisted_creator_new_video",
        "video_entered_top_n",
        "suggestion_reached_tier",
        "admin_broadcast",
        "audit_mode_ack",
        "deletion_grace_reminder",
      ],
      report_status: ["open", "reviewed", "dismissed"],
      submission_status: [
        "pending",
        "approved",
        "rejected",
        "duplicate",
        "invalid",
      ],
      tag_assigned_by: ["system", "user", "admin"],
      tag_source: ["platform", "sciencedirect", "youtube_api", "user"],
      tag_tier: ["primary", "secondary", "internal"],
      user_list_status: ["wishlist", "liked", "disliked", "watched"],
      video_status: ["pending", "approved", "rejected", "removed"],
    },
  },
} as const
