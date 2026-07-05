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
      ai_bot_alertas: {
        Row: {
          categoria: string
          created_at: string
          criticidade: string
          enviado_coordenador: boolean
          enviado_em: string | null
          id: string
          mensagem_origem: string | null
          nome: string | null
          resolvido: boolean
          resumo: string
          telefone: string
        }
        Insert: {
          categoria: string
          created_at?: string
          criticidade?: string
          enviado_coordenador?: boolean
          enviado_em?: string | null
          id?: string
          mensagem_origem?: string | null
          nome?: string | null
          resolvido?: boolean
          resumo: string
          telefone: string
        }
        Update: {
          categoria?: string
          created_at?: string
          criticidade?: string
          enviado_coordenador?: boolean
          enviado_em?: string | null
          id?: string
          mensagem_origem?: string | null
          nome?: string | null
          resolvido?: boolean
          resumo?: string
          telefone?: string
        }
        Relationships: []
      }
      ai_bot_autorizados: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string | null
          telefone: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string | null
          telefone: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string | null
          telefone?: string
        }
        Relationships: []
      }
      ai_bot_config: {
        Row: {
          alertas_ativos: boolean
          ativo: boolean
          coordenador_nome: string | null
          coordenador_nome_2: string | null
          coordenador_nome_3: string | null
          coordenador_nome_4: string | null
          coordenador_telefone: string | null
          coordenador_telefone_2: string | null
          coordenador_telefone_3: string | null
          coordenador_telefone_4: string | null
          created_at: string
          id: string
          janela_manha_fim: number
          janela_manha_inicio: number
          janela_noite_fim: number
          janela_noite_inicio: number
          max_historico: number
          modelo: string
          msg_manha: string
          msg_manha_variacoes: string[]
          msg_noite: string
          msg_noite_variacoes: string[]
          msg_programadas_ativas: boolean
          persona: string
          saudacao_inicial: string | null
          somente_autorizados: boolean
          temperatura: number
          updated_at: string
        }
        Insert: {
          alertas_ativos?: boolean
          ativo?: boolean
          coordenador_nome?: string | null
          coordenador_nome_2?: string | null
          coordenador_nome_3?: string | null
          coordenador_nome_4?: string | null
          coordenador_telefone?: string | null
          coordenador_telefone_2?: string | null
          coordenador_telefone_3?: string | null
          coordenador_telefone_4?: string | null
          created_at?: string
          id?: string
          janela_manha_fim?: number
          janela_manha_inicio?: number
          janela_noite_fim?: number
          janela_noite_inicio?: number
          max_historico?: number
          modelo?: string
          msg_manha?: string
          msg_manha_variacoes?: string[]
          msg_noite?: string
          msg_noite_variacoes?: string[]
          msg_programadas_ativas?: boolean
          persona?: string
          saudacao_inicial?: string | null
          somente_autorizados?: boolean
          temperatura?: number
          updated_at?: string
        }
        Update: {
          alertas_ativos?: boolean
          ativo?: boolean
          coordenador_nome?: string | null
          coordenador_nome_2?: string | null
          coordenador_nome_3?: string | null
          coordenador_nome_4?: string | null
          coordenador_telefone?: string | null
          coordenador_telefone_2?: string | null
          coordenador_telefone_3?: string | null
          coordenador_telefone_4?: string | null
          created_at?: string
          id?: string
          janela_manha_fim?: number
          janela_manha_inicio?: number
          janela_noite_fim?: number
          janela_noite_inicio?: number
          max_historico?: number
          modelo?: string
          msg_manha?: string
          msg_manha_variacoes?: string[]
          msg_noite?: string
          msg_noite_variacoes?: string[]
          msg_programadas_ativas?: boolean
          persona?: string
          saudacao_inicial?: string | null
          somente_autorizados?: boolean
          temperatura?: number
          updated_at?: string
        }
        Relationships: []
      }
      ai_bot_conversas: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          nome: string | null
          role: string
          telefone: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          nome?: string | null
          role: string
          telefone: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string | null
          role?: string
          telefone?: string
        }
        Relationships: []
      }
      ai_bot_envios_programados: {
        Row: {
          data_ref: string
          enviado_em: string
          id: string
          mensagem: string
          nome: string | null
          periodo: string
          sucesso: boolean
          telefone: string
        }
        Insert: {
          data_ref: string
          enviado_em?: string
          id?: string
          mensagem: string
          nome?: string | null
          periodo: string
          sucesso?: boolean
          telefone: string
        }
        Update: {
          data_ref?: string
          enviado_em?: string
          id?: string
          mensagem?: string
          nome?: string | null
          periodo?: string
          sucesso?: boolean
          telefone?: string
        }
        Relationships: []
      }
      ai_bot_exemplos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          ordem: number
          pergunta: string
          resposta: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          pergunta: string
          resposta: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          ordem?: number
          pergunta?: string
          resposta?: string
        }
        Relationships: []
      }
      ai_bot_kb: {
        Row: {
          ativo: boolean
          conteudo: string
          created_at: string
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          created_at?: string
          id?: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          created_at?: string
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      bairros: {
        Row: {
          contrato_id: string
          created_at: string
          id: string
          mapa_url: string | null
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          contrato_id: string
          created_at?: string
          id?: string
          mapa_url?: string | null
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          created_at?: string
          id?: string
          mapa_url?: string | null
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bairros_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          municipio: string | null
          numero: string
          periodo: string | null
          regional: string | null
          responsavel_tecnico: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          municipio?: string | null
          numero: string
          periodo?: string | null
          regional?: string | null
          responsavel_tecnico?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          municipio?: string | null
          numero?: string
          periodo?: string | null
          regional?: string | null
          responsavel_tecnico?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      encarregados: {
        Row: {
          ativo: boolean
          created_at: string
          foto_url: string | null
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
          foto_url?: string | null
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
          foto_url?: string | null
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
      form_pastas: {
        Row: {
          cor: string | null
          created_at: string
          criado_por: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      formulario_campos: {
        Row: {
          condicao: Json | null
          config: Json
          created_at: string
          descricao: string | null
          formulario_id: string
          id: string
          obrigatorio: boolean
          opcoes: Json
          ordem: number
          placeholder: string | null
          rotulo: string
          tipo: string
          updated_at: string
        }
        Insert: {
          condicao?: Json | null
          config?: Json
          created_at?: string
          descricao?: string | null
          formulario_id: string
          id?: string
          obrigatorio?: boolean
          opcoes?: Json
          ordem?: number
          placeholder?: string | null
          rotulo: string
          tipo: string
          updated_at?: string
        }
        Update: {
          condicao?: Json | null
          config?: Json
          created_at?: string
          descricao?: string | null
          formulario_id?: string
          id?: string
          obrigatorio?: boolean
          opcoes?: Json
          ordem?: number
          placeholder?: string | null
          rotulo?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formulario_campos_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      formulario_respostas: {
        Row: {
          arquivos: Json
          created_at: string
          dados: Json
          formulario_id: string
          id: string
          ip: string | null
          respondente_email: string | null
          respondente_id: string | null
          respondente_nome: string | null
          user_agent: string | null
        }
        Insert: {
          arquivos?: Json
          created_at?: string
          dados?: Json
          formulario_id: string
          id?: string
          ip?: string | null
          respondente_email?: string | null
          respondente_id?: string | null
          respondente_nome?: string | null
          user_agent?: string | null
        }
        Update: {
          arquivos?: Json
          created_at?: string
          dados?: Json
          formulario_id?: string
          id?: string
          ip?: string | null
          respondente_email?: string | null
          respondente_id?: string | null
          respondente_nome?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "formulario_respostas_formulario_id_fkey"
            columns: ["formulario_id"]
            isOneToOne: false
            referencedRelation: "formularios"
            referencedColumns: ["id"]
          },
        ]
      }
      formularios: {
        Row: {
          cor: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          icone: string | null
          id: string
          menu_icone: string | null
          menu_ordem: number
          modelo: boolean
          no_menu: boolean
          pasta_id: string | null
          permite_multiplas: boolean
          publico: boolean
          share_slug: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          menu_icone?: string | null
          menu_ordem?: number
          modelo?: boolean
          no_menu?: boolean
          pasta_id?: string | null
          permite_multiplas?: boolean
          publico?: boolean
          share_slug?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          menu_icone?: string | null
          menu_ordem?: number
          modelo?: boolean
          no_menu?: boolean
          pasta_id?: string | null
          permite_multiplas?: boolean
          publico?: boolean
          share_slug?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "formularios_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "form_pastas"
            referencedColumns: ["id"]
          },
        ]
      }
      foto_analise_jobs: {
        Row: {
          created_at: string
          erro: string | null
          foto_id: string
          id: string
          iniciado_em: string | null
          status: string
          tentativas: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          erro?: string | null
          foto_id: string
          id?: string
          iniciado_em?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          erro?: string | null
          foto_id?: string
          id?: string
          iniciado_em?: string | null
          status?: string
          tentativas?: number
          updated_at?: string
        }
        Relationships: []
      }
      foto_analises: {
        Row: {
          analisado_em: string
          conformidade_geral: string
          created_at: string
          epi_detectado: Json
          etapa: string
          etapa_confianca: number
          foto_id: string
          id: string
          modelo: string | null
          problemas: Json
          pv_qualidade: Json
          resumo: string
          rfo: boolean
          sinalizacao: Json
          tokens_in: number | null
          tokens_out: number | null
          updated_at: string
        }
        Insert: {
          analisado_em?: string
          conformidade_geral?: string
          created_at?: string
          epi_detectado?: Json
          etapa?: string
          etapa_confianca?: number
          foto_id: string
          id?: string
          modelo?: string | null
          problemas?: Json
          pv_qualidade?: Json
          resumo?: string
          rfo?: boolean
          sinalizacao?: Json
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
        }
        Update: {
          analisado_em?: string
          conformidade_geral?: string
          created_at?: string
          epi_detectado?: Json
          etapa?: string
          etapa_confianca?: number
          foto_id?: string
          id?: string
          modelo?: string | null
          problemas?: Json
          pv_qualidade?: Json
          resumo?: string
          rfo?: boolean
          sinalizacao?: Json
          tokens_in?: number | null
          tokens_out?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foto_analises_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: true
            referencedRelation: "fotos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_analises_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: true
            referencedRelation: "vw_fotos_completas"
            referencedColumns: ["id"]
          },
        ]
      }
      foto_avaliacoes: {
        Row: {
          avaliado_em: string
          avaliado_por: string | null
          created_at: string
          foto_id: string
          id: string
          motivo_id: string | null
          notificado: boolean
          observacao: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avaliado_em?: string
          avaliado_por?: string | null
          created_at?: string
          foto_id: string
          id?: string
          motivo_id?: string | null
          notificado?: boolean
          observacao?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          avaliado_em?: string
          avaliado_por?: string | null
          created_at?: string
          foto_id?: string
          id?: string
          motivo_id?: string | null
          notificado?: boolean
          observacao?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foto_avaliacoes_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: true
            referencedRelation: "fotos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_avaliacoes_foto_id_fkey"
            columns: ["foto_id"]
            isOneToOne: true
            referencedRelation: "vw_fotos_completas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foto_avaliacoes_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "motivos_reprovacao"
            referencedColumns: ["id"]
          },
        ]
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
      motivos_reprovacao: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
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
      ruas: {
        Row: {
          bairro_id: string
          created_at: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          bairro_id: string
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          bairro_id?: string
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruas_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros"
            referencedColumns: ["id"]
          },
        ]
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
      visao_config: {
        Row: {
          aprendizado: string
          id: string
          manual_fotos: string
          modelo: string
          updated_at: string
        }
        Insert: {
          aprendizado?: string
          id?: string
          manual_fotos?: string
          modelo?: string
          updated_at?: string
        }
        Update: {
          aprendizado?: string
          id?: string
          manual_fotos?: string
          modelo?: string
          updated_at?: string
        }
        Relationships: []
      }
      vistoria_atribuicoes: {
        Row: {
          created_at: string
          fase: string
          id: string
          rua_id: string
          vistoriante_id: string
        }
        Insert: {
          created_at?: string
          fase?: string
          id?: string
          rua_id: string
          vistoriante_id: string
        }
        Update: {
          created_at?: string
          fase?: string
          id?: string
          rua_id?: string
          vistoriante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_atribuicoes_rua_id_fkey"
            columns: ["rua_id"]
            isOneToOne: false
            referencedRelation: "ruas"
            referencedColumns: ["id"]
          },
        ]
      }
      vistoria_fotos: {
        Row: {
          captured_at: string
          created_at: string
          endereco_formatado: string | null
          enviado_por: string
          exif: Json
          fase: string
          id: string
          lado: string | null
          latitude: number | null
          longitude: number | null
          numero_casa: string | null
          observacao: string | null
          par_pre_id: string | null
          rua_id: string
          similaridade_angulo: number | null
          status: string
          storage_path_carimbada: string
          storage_path_original: string
          tipo: string
          updated_at: string
        }
        Insert: {
          captured_at: string
          created_at?: string
          endereco_formatado?: string | null
          enviado_por: string
          exif?: Json
          fase: string
          id?: string
          lado?: string | null
          latitude?: number | null
          longitude?: number | null
          numero_casa?: string | null
          observacao?: string | null
          par_pre_id?: string | null
          rua_id: string
          similaridade_angulo?: number | null
          status?: string
          storage_path_carimbada: string
          storage_path_original: string
          tipo: string
          updated_at?: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          endereco_formatado?: string | null
          enviado_por?: string
          exif?: Json
          fase?: string
          id?: string
          lado?: string | null
          latitude?: number | null
          longitude?: number | null
          numero_casa?: string | null
          observacao?: string | null
          par_pre_id?: string | null
          rua_id?: string
          similaridade_angulo?: number | null
          status?: string
          storage_path_carimbada?: string
          storage_path_original?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_fotos_par_pre_id_fkey"
            columns: ["par_pre_id"]
            isOneToOne: false
            referencedRelation: "vistoria_fotos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistoria_fotos_rua_id_fkey"
            columns: ["rua_id"]
            isOneToOne: false
            referencedRelation: "ruas"
            referencedColumns: ["id"]
          },
        ]
      }
      vistoria_relatorio_jobs: {
        Row: {
          bairro_id: string
          chunks_path: string | null
          concluido_em: string | null
          contrato_id: string
          fotos_processadas: number
          id: string
          iniciado_em: string | null
          mensagem_erro: string | null
          pdf_path: string | null
          progresso_atual: number
          progresso_total: number
          solicitado_em: string
          solicitado_por: string
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          bairro_id: string
          chunks_path?: string | null
          concluido_em?: string | null
          contrato_id: string
          fotos_processadas?: number
          id?: string
          iniciado_em?: string | null
          mensagem_erro?: string | null
          pdf_path?: string | null
          progresso_atual?: number
          progresso_total?: number
          solicitado_em?: string
          solicitado_por: string
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          bairro_id?: string
          chunks_path?: string | null
          concluido_em?: string | null
          contrato_id?: string
          fotos_processadas?: number
          id?: string
          iniciado_em?: string | null
          mensagem_erro?: string | null
          pdf_path?: string | null
          progresso_atual?: number
          progresso_total?: number
          solicitado_em?: string
          solicitado_por?: string
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      vistoria_relatorios: {
        Row: {
          bairro_id: string | null
          contrato_id: string
          gerado_em: string
          gerado_por: string
          id: string
          pdf_path: string
          revisao: string
        }
        Insert: {
          bairro_id?: string | null
          contrato_id: string
          gerado_em?: string
          gerado_por: string
          id?: string
          pdf_path: string
          revisao?: string
        }
        Update: {
          bairro_id?: string | null
          contrato_id?: string
          gerado_em?: string
          gerado_por?: string
          id?: string
          pdf_path?: string
          revisao?: string
        }
        Relationships: [
          {
            foreignKeyName: "vistoria_relatorios_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "bairros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vistoria_relatorios_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
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
      vistoriante_tem_rua: {
        Args: { _rua: string; _user: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "vistoriante" | "analista"
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
      app_role: ["admin", "user", "vistoriante", "analista"],
    },
  },
} as const
