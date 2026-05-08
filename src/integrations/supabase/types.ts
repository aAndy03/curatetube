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
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
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
          name: string
          slug: string
        }
        Insert: {
          approved?: boolean
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          approved?: boolean
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
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
      video_categories: {
        Row: {
          category_id: string
          video_id: string
        }
        Insert: {
          category_id: string
          video_id: string
        }
        Update: {
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
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tags: {
        Row: {
          tag_id: string
          video_id: string
        }
        Insert: {
          tag_id: string
          video_id: string
        }
        Update: {
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
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
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
      [_ in never]: never
    }
    Functions: {
      has_permission: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
    }
    Enums: {
      audit_privacy_mode: "anonymous" | "public"
      audit_visibility: "internal" | "staff" | "public"
      submission_status:
        | "pending"
        | "approved"
        | "rejected"
        | "duplicate"
        | "invalid"
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
      submission_status: [
        "pending",
        "approved",
        "rejected",
        "duplicate",
        "invalid",
      ],
      video_status: ["pending", "approved", "rejected", "removed"],
    },
  },
} as const
