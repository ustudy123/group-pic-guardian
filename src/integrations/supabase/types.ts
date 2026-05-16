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
      encarregados: {
        Row: {
          ativo: boolean
          created_at: string
          grupo_whatsapp_id: string
          grupo_whatsapp_nome: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo_whatsapp_id: string
          grupo_whatsapp_nome?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo_whatsapp_id?: string
          grupo_whatsapp_nome?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      eventos_raw: {
        Row: {
          chat_id: string | null
          created_at: string
          erro: string | null
          id: string
          message_id: string | null
          payload: Json
          processado: boolean
          tipo_evento: string
        }
        Insert: {
          chat_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          message_id?: string | null
          payload: Json
          processado?: boolean
          tipo_evento: string
        }
        Update: {
          chat_id?: string | null
          created_at?: string
          erro?: string | null
          id?: string
          message_id?: string | null
          payload?: Json
          processado?: boolean
          tipo_evento?: string
        }
        Relationships: []
      }
      fotos: {
        Row: {
          altura: number | null
          caption: string | null
          created_at: string
          data_envio: string
          data_pasta: string
          encarregado_id: string
          erro_mensagem: string | null
          id: string
          largura: number | null
          message_id: string
          mime_type: string | null
          remetente_nome: string | null
          remetente_telefone: string | null
          status: string
          storage_path: string
          storage_url: string | null
          tamanho_bytes: number | null
        }
        Insert: {
          altura?: number | null
          caption?: string | null
          created_at?: string
          data_envio: string
          data_pasta: string
          encarregado_id: string
          erro_mensagem?: string | null
          id?: string
          largura?: number | null
          message_id: string
          mime_type?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
          status?: string
          storage_path: string
          storage_url?: string | null
          tamanho_bytes?: number | null
        }
        Update: {
          altura?: number | null
          caption?: string | null
          created_at?: string
          data_envio?: string
          data_pasta?: string
          encarregado_id?: string
          erro_mensagem?: string | null
          id?: string
          largura?: number | null
          message_id?: string
          mime_type?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
          status?: string
          storage_path?: string
          storage_url?: string | null
          tamanho_bytes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fotos_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "encarregados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fotos_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "vw_fotos_completas"
            referencedColumns: ["encarregado_id"]
          },
          {
            foreignKeyName: "fotos_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_diario"
            referencedColumns: ["encarregado_id"]
          },
        ]
      }
      grupos: {
        Row: {
          ativo: boolean
          created_at: string
          encarregado: string | null
          id: string
          nome_exibicao: string
          ultima_foto_em: string | null
          updated_at: string
          whatsapp_jid: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          encarregado?: string | null
          id?: string
          nome_exibicao: string
          ultima_foto_em?: string | null
          updated_at?: string
          whatsapp_jid: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          encarregado?: string | null
          id?: string
          nome_exibicao?: string
          ultima_foto_em?: string | null
          updated_at?: string
          whatsapp_jid?: string
        }
        Relationships: []
      }
      localizacoes: {
        Row: {
          consulta_enviada: boolean
          consulta_enviada_em: string | null
          created_at: string
          data_envio: string
          encarregado_id: string
          endereco: string | null
          id: string
          latitude: number
          longitude: number
          message_id: string
          nome_local: string | null
          remetente_nome: string | null
          remetente_telefone: string | null
        }
        Insert: {
          consulta_enviada?: boolean
          consulta_enviada_em?: string | null
          created_at?: string
          data_envio: string
          encarregado_id: string
          endereco?: string | null
          id?: string
          latitude: number
          longitude: number
          message_id: string
          nome_local?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
        }
        Update: {
          consulta_enviada?: boolean
          consulta_enviada_em?: string | null
          created_at?: string
          data_envio?: string
          encarregado_id?: string
          endereco?: string | null
          id?: string
          latitude?: number
          longitude?: number
          message_id?: string
          nome_local?: string | null
          remetente_nome?: string | null
          remetente_telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "localizacoes_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "encarregados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "localizacoes_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "vw_fotos_completas"
            referencedColumns: ["encarregado_id"]
          },
          {
            foreignKeyName: "localizacoes_encarregado_id_fkey"
            columns: ["encarregado_id"]
            isOneToOne: false
            referencedRelation: "vw_resumo_diario"
            referencedColumns: ["encarregado_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_bot_status: {
        Row: {
          connection_status: string
          created_at: string
          id: string
          last_error: string | null
          last_event_at: string
          meta: Json
          phone_jid: string | null
          qr_text: string | null
          updated_at: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          id: string
          last_error?: string | null
          last_event_at?: string
          meta?: Json
          phone_jid?: string | null
          qr_text?: string | null
          updated_at?: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_event_at?: string
          meta?: Json
          phone_jid?: string | null
          qr_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      vw_fotos_completas: {
        Row: {
          altura: number | null
          caption: string | null
          created_at: string | null
          data_envio: string | null
          data_pasta: string | null
          encarregado_id: string | null
          encarregado_nome: string | null
          grupo_whatsapp_nome: string | null
          id: string | null
          largura: number | null
          message_id: string | null
          mime_type: string | null
          remetente_nome: string | null
          remetente_telefone: string | null
          status: string | null
          storage_path: string | null
          storage_url: string | null
          tamanho_bytes: number | null
        }
        Relationships: []
      }
      vw_resumo_diario: {
        Row: {
          data_pasta: string | null
          encarregado_id: string | null
          encarregado_nome: string | null
          primeira_foto: string | null
          total_fotos: number | null
          ultima_foto: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      limpar_eventos_antigos: { Args: { dias?: number }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
