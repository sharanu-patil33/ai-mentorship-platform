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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          created_at: string
          id: string
          meeting_id: string
          message: string
          sender_id: string | null
          sender_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          meeting_id: string
          message: string
          sender_id?: string | null
          sender_name: string
        }
        Update: {
          created_at?: string
          id?: string
          meeting_id?: string
          message?: string
          sender_id?: string | null
          sender_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          text: string
          media_url: string | null
          media_type: string | null
          meeting_id: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          text: string
          media_url?: string | null
          media_type?: string | null
          meeting_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          text?: string
          media_url?: string | null
          media_type?: string | null
          meeting_id?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      meeting_participants: {
        Row: {
          camera_enabled: boolean
          display_name: string
          id: string
          joined_at: string
          left_at: string | null
          meeting_id: string
          mic_enabled: boolean
          role: Database["public"]["Enums"]["participant_role"]
          screen_sharing: boolean
          status: Database["public"]["Enums"]["participant_status"]
          user_id: string | null
        }
        Insert: {
          camera_enabled?: boolean
          display_name: string
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id: string
          mic_enabled?: boolean
          role?: Database["public"]["Enums"]["participant_role"]
          screen_sharing?: boolean
          status?: Database["public"]["Enums"]["participant_status"]
          user_id?: string | null
        }
        Update: {
          camera_enabled?: boolean
          display_name?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          meeting_id?: string
          mic_enabled?: boolean
          role?: Database["public"]["Enums"]["participant_role"]
          screen_sharing?: boolean
          status?: Database["public"]["Enums"]["participant_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          duration_minutes: number
          ended_at: string | null
          expires_at: string | null
          host_id: string
          id: string
          locked: boolean
          meeting_id: string
          password_hash: string | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["meeting_status"]
          time_warning_sent: boolean
          title: string
          updated_at: string
          waiting_room_enabled: boolean
        }
        Insert: {
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          expires_at?: string | null
          host_id: string
          id?: string
          locked?: boolean
          meeting_id: string
          password_hash?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          time_warning_sent?: boolean
          title: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Update: {
          created_at?: string
          duration_minutes?: number
          ended_at?: string | null
          expires_at?: string | null
          host_id?: string
          id?: string
          locked?: boolean
          meeting_id?: string
          password_hash?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["meeting_status"]
          time_warning_sent?: boolean
          title?: string
          updated_at?: string
          waiting_room_enabled?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_meeting_by_code: {
        Args: { _code: string }
        Returns: {
          created_at: string
          ended_at: string
          has_password: boolean
          host_id: string
          id: string
          locked: boolean
          meeting_id: string
          scheduled_at: string
          started_at: string
          status: string
          time_warning_sent: boolean
          title: string
          updated_at: string
          waiting_room_enabled: boolean
        }[]
      }
    }
    Enums: {
      meeting_status: "waiting" | "scheduled" | "active" | "ended"
      participant_role: "host" | "co-host" | "participant"
      participant_status: "waiting" | "admitted" | "rejected" | "left"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
