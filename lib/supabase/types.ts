export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_requests: {
        Row: {
          business_entity_id: string
          firm_note: string | null
          id: string
          kind: string
          message: string | null
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          business_entity_id: string
          firm_note?: string | null
          id?: string
          kind: string
          message?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          business_entity_id?: string
          firm_note?: string | null
          id?: string
          kind?: string
          message?: string | null
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_requests_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_daily: {
        Row: {
          business_entity_id: string
          day: string
          input_tokens: number
          messages: number
          output_tokens: number
          updated_at: string
        }
        Insert: {
          business_entity_id: string
          day: string
          input_tokens?: number
          messages?: number
          output_tokens?: number
          updated_at?: string
        }
        Update: {
          business_entity_id?: string
          day?: string
          input_tokens?: number
          messages?: number
          output_tokens?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_daily_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          business_entity_id: string | null
          created_at: string
          id: number
          ip: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          business_entity_id?: string | null
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          business_entity_id?: string | null
          created_at?: string
          id?: number
          ip?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_type: string | null
          business_entity_id: string
          created_at: string
          currency: string
          id: string
          institution: string
          masked_number: string
        }
        Insert: {
          account_type?: string | null
          business_entity_id: string
          created_at?: string
          currency?: string
          id?: string
          institution: string
          masked_number: string
        }
        Update: {
          account_type?: string | null
          business_entity_id?: string
          created_at?: string
          currency?: string
          id?: string
          institution?: string
          masked_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statements: {
        Row: {
          bank_account_id: string
          beginning_balance: number | null
          business_entity_id: string
          confidence: number | null
          created_at: string
          created_by: string | null
          document_version_id: string | null
          ending_balance: number | null
          id: string
          kind: string
          period_end: string
          period_start: string
          published_at: string | null
          published_by: string | null
          reconciliation: Json | null
          source: string
          status: string
          superseded_by: string | null
          updated_at: string
        }
        Insert: {
          bank_account_id: string
          beginning_balance?: number | null
          business_entity_id: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          ending_balance?: number | null
          id?: string
          kind?: string
          period_end: string
          period_start: string
          published_at?: string | null
          published_by?: string | null
          reconciliation?: Json | null
          source: string
          status?: string
          superseded_by?: string | null
          updated_at?: string
        }
        Update: {
          bank_account_id?: string
          beginning_balance?: number | null
          business_entity_id?: string
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          ending_balance?: number | null
          id?: string
          kind?: string
          period_end?: string
          period_start?: string
          published_at?: string | null
          published_by?: string | null
          reconciliation?: Json | null
          source?: string
          status?: string
          superseded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statements_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_statements_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          bank_account_id: string
          bank_statement_id: string
          business_entity_id: string
          category_id: string | null
          confidence: number | null
          created_at: string
          credit: number | null
          debit: number | null
          dedupe_key: string
          description: string
          document_version_id: string | null
          id: string
          is_recurring: boolean | null
          normalized_description: string | null
          page_number: number | null
          posting_date: string | null
          running_balance: number | null
          source: string
          txn_date: string
          vendor: string | null
        }
        Insert: {
          bank_account_id: string
          bank_statement_id: string
          business_entity_id: string
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          dedupe_key: string
          description: string
          document_version_id?: string | null
          id?: string
          is_recurring?: boolean | null
          normalized_description?: string | null
          page_number?: number | null
          posting_date?: string | null
          running_balance?: number | null
          source?: string
          txn_date: string
          vendor?: string | null
        }
        Update: {
          bank_account_id?: string
          bank_statement_id?: string
          business_entity_id?: string
          category_id?: string | null
          confidence?: number | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          dedupe_key?: string
          description?: string
          document_version_id?: string | null
          id?: string
          is_recurring?: boolean | null
          normalized_description?: string | null
          page_number?: number | null
          posting_date?: string | null
          running_balance?: number | null
          source?: string
          txn_date?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_bank_statement_id_fkey"
            columns: ["bank_statement_id"]
            isOneToOne: false
            referencedRelation: "bank_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_entities: {
        Row: {
          accounting_basis: string
          address: Json | null
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          enabled_modules: Json
          fiscal_year_start_month: number
          id: string
          legal_name: string | null
          name: string
          sales_tax_enabled: boolean
          status: string
          updated_at: string
        }
        Insert: {
          accounting_basis?: string
          address?: Json | null
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          enabled_modules?: Json
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          name: string
          sales_tax_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          accounting_basis?: string
          address?: Json | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          enabled_modules?: Json
          fiscal_year_start_month?: number
          id?: string
          legal_name?: string | null
          name?: string
          sales_tax_enabled?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_entities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_citations: {
        Row: {
          business_entity_id: string
          citation_key: string
          created_at: string
          document_version_id: string | null
          id: string
          label: string
          line_id: string | null
          message_id: string
          page_number: number | null
          period_end: string | null
          period_start: string | null
          report_id: string | null
          session_id: string
          source: string | null
        }
        Insert: {
          business_entity_id: string
          citation_key: string
          created_at?: string
          document_version_id?: string | null
          id?: string
          label: string
          line_id?: string | null
          message_id: string
          page_number?: number | null
          period_end?: string | null
          period_start?: string | null
          report_id?: string | null
          session_id: string
          source?: string | null
        }
        Update: {
          business_entity_id?: string
          citation_key?: string
          created_at?: string
          document_version_id?: string | null
          id?: string
          label?: string
          line_id?: string | null
          message_id?: string
          page_number?: number | null
          period_end?: string | null
          period_start?: string | null
          report_id?: string | null
          session_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_citations_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_citations_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_citations_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "financial_statement_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_citations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_citations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_citations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          business_entity_id: string
          content: Json
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          business_entity_id: string
          content: Json
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          business_entity_id?: string
          content?: Json
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          business_entity_id: string
          created_at: string
          id: string
          last_message_at: string | null
          title: string | null
          total_input_tokens: number
          total_output_tokens: number
          user_id: string | null
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          user_id?: string | null
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          firm_id: string
          id: string
          name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          firm_id: string
          id?: string
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          firm_id?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          business_entity_id: string
          classified_at: string | null
          confidence: number | null
          document_version_id: string
          id: string
          kind: string | null
          page_number: number
          period_end: string | null
          period_start: string | null
          report_type: string | null
        }
        Insert: {
          business_entity_id: string
          classified_at?: string | null
          confidence?: number | null
          document_version_id: string
          id?: string
          kind?: string | null
          page_number: number
          period_end?: string | null
          period_start?: string | null
          report_type?: string | null
        }
        Update: {
          business_entity_id?: string
          classified_at?: string | null
          confidence?: number | null
          document_version_id?: string
          id?: string
          kind?: string | null
          page_number?: number
          period_end?: string | null
          period_start?: string | null
          report_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempts: number
          business_entity_id: string
          created_at: string
          document_version_id: string
          error_code: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          max_attempts: number
          run_after: string
          status: string
          step: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          business_entity_id: string
          created_at?: string
          document_version_id: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          max_attempts?: number
          run_after?: string
          status?: string
          step?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          business_entity_id?: string
          created_at?: string
          document_version_id?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          locked_at?: string | null
          max_attempts?: number
          run_after?: string
          status?: string
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_jobs_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          business_entity_id: string
          created_at: string
          document_id: string
          id: string
          mime_type: string
          original_filename: string
          page_count: number | null
          reject_code: string | null
          sha256: string | null
          size_bytes: number
          storage_path: string
          superseded_at: string | null
          supersedes_version_id: string | null
          upload_status: string
          uploaded_by: string | null
          version_no: number
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          document_id: string
          id?: string
          mime_type: string
          original_filename: string
          page_count?: number | null
          reject_code?: string | null
          sha256?: string | null
          size_bytes: number
          storage_path: string
          superseded_at?: string | null
          supersedes_version_id?: string | null
          upload_status?: string
          uploaded_by?: string | null
          version_no: number
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          document_id?: string
          id?: string
          mime_type?: string
          original_filename?: string
          page_count?: number | null
          reject_code?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          superseded_at?: string | null
          supersedes_version_id?: string | null
          upload_status?: string
          uploaded_by?: string | null
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_supersedes_version_id_fkey"
            columns: ["supersedes_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          business_entity_id: string
          created_at: string
          created_by: string | null
          current_version_id: string | null
          document_type: string
          id: string
          period_end: string | null
          period_start: string | null
          published_at: string | null
          published_by: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          document_type: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          document_type?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_firm_notes: {
        Row: {
          business_entity_id: string
          notes: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          business_entity_id: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          business_entity_id?: string
          notes?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_firm_notes_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: true
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_memberships: {
        Row: {
          business_entity_id: string
          invited_by: string | null
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          business_entity_id: string
          invited_by?: string | null
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          business_entity_id?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_memberships_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          business_entity_id: string
          created_at: string
          id: string
          is_fixed: boolean | null
          kind: string
          name: string
          parent_id: string | null
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          id?: string
          is_fixed?: boolean | null
          kind?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          id?: string
          is_fixed?: boolean | null
          kind?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          business_entity_id: string
          created_at: string
          end_date: string
          fiscal_year: number | null
          id: string
          label: string | null
          period_type: string
          start_date: string
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          end_date: string
          fiscal_year?: number | null
          id?: string
          label?: string | null
          period_type: string
          start_date: string
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          end_date?: string
          fiscal_year?: number | null
          id?: string
          label?: string | null
          period_type?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          basis: string | null
          business_entity_id: string
          comparative_end: string | null
          comparative_start: string | null
          confidence: number | null
          created_at: string
          created_by: string | null
          currency: string
          document_version_id: string | null
          entity_name_on_statement: string | null
          id: string
          period_end: string
          period_start: string
          published_at: string | null
          published_by: string | null
          reconciliation: Json | null
          report_type: string
          source: string
          statement_date: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          warnings: Json
        }
        Insert: {
          basis?: string | null
          business_entity_id: string
          comparative_end?: string | null
          comparative_start?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_version_id?: string | null
          entity_name_on_statement?: string | null
          id?: string
          period_end: string
          period_start: string
          published_at?: string | null
          published_by?: string | null
          reconciliation?: Json | null
          report_type: string
          source: string
          statement_date?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          warnings?: Json
        }
        Update: {
          basis?: string | null
          business_entity_id?: string
          comparative_end?: string | null
          comparative_start?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_version_id?: string | null
          entity_name_on_statement?: string | null
          id?: string
          period_end?: string
          period_start?: string
          published_at?: string | null
          published_by?: string | null
          reconciliation?: Json | null
          report_type?: string
          source?: string
          statement_date?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_statement_lines: {
        Row: {
          account_name: string
          account_number: string | null
          business_entity_id: string
          confidence: number | null
          corrected_at: string | null
          corrected_by: string | null
          created_at: string
          current: number | null
          depth: number
          document_version_id: string | null
          extracted_current: number | null
          extracted_prior: number | null
          id: string
          is_section: boolean
          is_total: boolean
          page_number: number | null
          parent_line_id: string | null
          position: number
          prior: number | null
          report_id: string
          section: string | null
          source: string
          source_text: string | null
        }
        Insert: {
          account_name: string
          account_number?: string | null
          business_entity_id: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          current?: number | null
          depth?: number
          document_version_id?: string | null
          extracted_current?: number | null
          extracted_prior?: number | null
          id?: string
          is_section?: boolean
          is_total?: boolean
          page_number?: number | null
          parent_line_id?: string | null
          position: number
          prior?: number | null
          report_id: string
          section?: string | null
          source?: string
          source_text?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string | null
          business_entity_id?: string
          confidence?: number | null
          corrected_at?: string | null
          corrected_by?: string | null
          created_at?: string
          current?: number | null
          depth?: number
          document_version_id?: string | null
          extracted_current?: number | null
          extracted_prior?: number | null
          id?: string
          is_section?: boolean
          is_total?: boolean
          page_number?: number | null
          parent_line_id?: string | null
          position?: number
          prior?: number | null
          report_id?: string
          section?: string | null
          source?: string
          source_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_statement_lines_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_statement_lines_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_statement_lines_parent_line_id_fkey"
            columns: ["parent_line_id"]
            isOneToOne: false
            referencedRelation: "financial_statement_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_statement_lines_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_memberships: {
        Row: {
          created_at: string
          created_by: string | null
          firm_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          firm_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          firm_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "firm_memberships_firm_id_fkey"
            columns: ["firm_id"]
            isOneToOne: false
            referencedRelation: "firms"
            referencedColumns: ["id"]
          },
        ]
      }
      firms: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      generated_exports: {
        Row: {
          business_entity_id: string
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          report_id: string | null
          status: string
          storage_path: string | null
          user_id: string | null
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          report_id?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string | null
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          report_id?: string | null
          status?: string
          storage_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_exports_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_exports_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "financial_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_dismissals: {
        Row: {
          business_entity_id: string
          dismissed_at: string
          period_end: string
          period_start: string
          rule_key: string
          user_id: string
        }
        Insert: {
          business_entity_id: string
          dismissed_at?: string
          period_end: string
          period_start: string
          rule_key: string
          user_id: string
        }
        Update: {
          business_entity_id?: string
          dismissed_at?: string
          period_end?: string
          period_start?: string
          rule_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_dismissals_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          body: string
          business_entity_id: string
          dismissed_at: string | null
          expires_at: string | null
          generated_at: string
          id: string
          link_path: string | null
          payload: Json
          period_end: string | null
          period_start: string | null
          rule_key: string
          severity: string
          title: string
        }
        Insert: {
          body: string
          business_entity_id: string
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string
          id?: string
          link_path?: string | null
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          rule_key: string
          severity: string
          title: string
        }
        Update: {
          body?: string
          business_entity_id?: string
          dismissed_at?: string | null
          expires_at?: string | null
          generated_at?: string
          id?: string
          link_path?: string | null
          payload?: Json
          period_end?: string | null
          period_start?: string | null
          rule_key?: string
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          business_entity_id: string
          document_activity: boolean
          email_digest: boolean
          new_reports: boolean
          reminders: boolean
          tax_deadlines: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          business_entity_id: string
          document_activity?: boolean
          email_digest?: boolean
          new_reports?: boolean
          reminders?: boolean
          tax_deadlines?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          business_entity_id?: string
          document_activity?: boolean
          email_digest?: boolean
          new_reports?: boolean
          reminders?: boolean
          tax_deadlines?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          business_entity_id: string | null
          created_at: string
          id: string
          kind: string
          link_path: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          business_entity_id?: string | null
          created_at?: string
          id?: string
          kind: string
          link_path?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          business_entity_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          link_path?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_obligations: {
        Row: {
          business_entity_id: string
          created_at: string
          created_by: string | null
          deposit_due_date: string | null
          document_version_id: string | null
          gross_wages: number | null
          id: string
          pay_date: string | null
          period_end: string | null
          period_start: string | null
          published_at: string | null
          published_by: string | null
          source: string
          status: string
          tax_deposit_amount: number | null
          updated_at: string
        }
        Insert: {
          business_entity_id: string
          created_at?: string
          created_by?: string | null
          deposit_due_date?: string | null
          document_version_id?: string | null
          gross_wages?: number | null
          id?: string
          pay_date?: string | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          source: string
          status?: string
          tax_deposit_amount?: number | null
          updated_at?: string
        }
        Update: {
          business_entity_id?: string
          created_at?: string
          created_by?: string | null
          deposit_due_date?: string | null
          document_version_id?: string | null
          gross_wages?: number | null
          id?: string
          pay_date?: string | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          source?: string
          status?: string
          tax_deposit_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_obligations_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_obligations_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          action_required: string | null
          amount: number | null
          business_entity_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          document_version_id: string | null
          due_date: string
          id: string
          published_at: string | null
          published_by: string | null
          related_obligation_id: string | null
          related_payroll_id: string | null
          reminder_type: string
          responsible: string
          source: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          action_required?: string | null
          amount?: number | null
          business_entity_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          due_date: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          related_obligation_id?: string | null
          related_payroll_id?: string | null
          reminder_type: string
          responsible?: string
          source?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          action_required?: string | null
          amount?: number | null
          business_entity_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          due_date?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          related_obligation_id?: string | null
          related_payroll_id?: string | null
          reminder_type?: string
          responsible?: string
          source?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_obligation_id_fkey"
            columns: ["related_obligation_id"]
            isOneToOne: false
            referencedRelation: "tax_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_related_payroll_id_fkey"
            columns: ["related_payroll_id"]
            isOneToOne: false
            referencedRelation: "payroll_obligations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_jurisdictions: {
        Row: {
          business_entity_id: string
          code: string
          created_at: string
          filing_frequency: string | null
          id: string
          level: string
          name: string
        }
        Insert: {
          business_entity_id: string
          code: string
          created_at?: string
          filing_frequency?: string | null
          id?: string
          level: string
          name: string
        }
        Update: {
          business_entity_id?: string
          code?: string
          created_at?: string
          filing_frequency?: string | null
          id?: string
          level?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_jurisdictions_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_obligations: {
        Row: {
          amount_confirmed: number | null
          amount_estimated: number | null
          amount_paid: number | null
          amount_payable: number | null
          business_entity_id: string
          confidence: number | null
          confirmation_number: string | null
          created_at: string
          created_by: string | null
          document_version_id: string | null
          due_date: string | null
          filing_status: string | null
          id: string
          jurisdiction_id: string | null
          non_taxable_sales: number | null
          notes: string | null
          page_number: number | null
          period_end: string | null
          period_start: string | null
          published_at: string | null
          published_by: string | null
          source: string
          status: string
          superseded_by: string | null
          tax_collected: number | null
          tax_type: string
          tax_year: number | null
          taxable_sales: number | null
          updated_at: string
        }
        Insert: {
          amount_confirmed?: number | null
          amount_estimated?: number | null
          amount_paid?: number | null
          amount_payable?: number | null
          business_entity_id: string
          confidence?: number | null
          confirmation_number?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          due_date?: string | null
          filing_status?: string | null
          id?: string
          jurisdiction_id?: string | null
          non_taxable_sales?: number | null
          notes?: string | null
          page_number?: number | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          source: string
          status?: string
          superseded_by?: string | null
          tax_collected?: number | null
          tax_type: string
          tax_year?: number | null
          taxable_sales?: number | null
          updated_at?: string
        }
        Update: {
          amount_confirmed?: number | null
          amount_estimated?: number | null
          amount_paid?: number | null
          amount_payable?: number | null
          business_entity_id?: string
          confidence?: number | null
          confirmation_number?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          due_date?: string | null
          filing_status?: string | null
          id?: string
          jurisdiction_id?: string | null
          non_taxable_sales?: number | null
          notes?: string | null
          page_number?: number | null
          period_end?: string | null
          period_start?: string | null
          published_at?: string | null
          published_by?: string | null
          source?: string
          status?: string
          superseded_by?: string | null
          tax_collected?: number | null
          tax_type?: string
          tax_year?: number | null
          taxable_sales?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_obligations_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_jurisdiction_id_fkey"
            columns: ["jurisdiction_id"]
            isOneToOne: false
            referencedRelation: "tax_jurisdictions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_obligations_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "tax_obligations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_payments: {
        Row: {
          amount: number
          business_entity_id: string
          confidence: number | null
          confirmation_number: string | null
          created_at: string
          created_by: string | null
          document_version_id: string | null
          id: string
          method: string | null
          obligation_id: string
          page_number: number | null
          paid_on: string
          published_at: string | null
          published_by: string | null
          source: string
        }
        Insert: {
          amount: number
          business_entity_id: string
          confidence?: number | null
          confirmation_number?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          id?: string
          method?: string | null
          obligation_id: string
          page_number?: number | null
          paid_on: string
          published_at?: string | null
          published_by?: string | null
          source: string
        }
        Update: {
          amount?: number
          business_entity_id?: string
          confidence?: number | null
          confirmation_number?: string | null
          created_at?: string
          created_by?: string | null
          document_version_id?: string | null
          id?: string
          method?: string | null
          obligation_id?: string
          page_number?: number | null
          paid_on?: string
          published_at?: string | null
          published_by?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_payments_business_entity_id_fkey"
            columns: ["business_entity_id"]
            isOneToOne: false
            referencedRelation: "business_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_payments_document_version_id_fkey"
            columns: ["document_version_id"]
            isOneToOne: false
            referencedRelation: "document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_payments_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "tax_obligations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bank_statement_is_published: {
        Args: { statement: string }
        Returns: boolean
      }
      claim_processing_jobs: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          business_entity_id: string
          created_at: string
          document_version_id: string
          error_code: string | null
          finished_at: string | null
          id: string
          locked_at: string | null
          max_attempts: number
          run_after: string
          status: string
          step: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "document_processing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_rate_limit: {
        Args: { p_key: string; p_max: number; p_window: string }
        Returns: boolean
      }
      document_object_is_client_visible: {
        Args: { object_name: string }
        Returns: boolean
      }
      is_entity_member: { Args: { entity: string }; Returns: boolean }
      is_entity_owner: { Args: { entity: string }; Returns: boolean }
      is_firm_admin: { Args: never; Returns: boolean }
      is_firm_member: { Args: never; Returns: boolean }
      object_entity_id: { Args: { object_name: string }; Returns: string }
      report_is_published: { Args: { report: string }; Returns: boolean }
      shares_entity_with: { Args: { target: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

