export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          business_entity_id: string | null;
          created_at: string;
          id: number;
          ip: unknown | null;
          metadata: Json | null;
          resource_id: string | null;
          resource_type: string | null;
          user_agent: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          business_entity_id?: string | null;
          created_at?: string;
          id?: number;
          ip?: unknown | null;
          metadata?: Json | null;
          resource_id?: string | null;
          resource_type?: string | null;
          user_agent?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          business_entity_id?: string | null;
          created_at?: string;
          id?: number;
          ip?: unknown | null;
          metadata?: Json | null;
          resource_id?: string | null;
          resource_type?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_logs_business_entity_id_fkey';
            columns: ['business_entity_id'];
            isOneToOne: false;
            referencedRelation: 'business_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      business_entities: {
        Row: {
          address: Json | null;
          created_at: string;
          created_by: string | null;
          id: string;
          legal_name: string | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          address?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          address?: Json | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          business_entity_id: string;
          content: Json;
          created_at: string;
          id: string;
          role: string;
          session_id: string;
        };
        Insert: {
          business_entity_id: string;
          content: Json;
          created_at?: string;
          id?: string;
          role: string;
          session_id: string;
        };
        Update: {
          business_entity_id?: string;
          content?: Json;
          created_at?: string;
          id?: string;
          role?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_business_entity_id_fkey';
            columns: ['business_entity_id'];
            isOneToOne: false;
            referencedRelation: 'business_entities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'chat_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'chat_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_sessions: {
        Row: {
          business_entity_id: string;
          created_at: string;
          id: string;
          last_message_at: string | null;
          title: string | null;
          total_input_tokens: number;
          total_output_tokens: number;
          user_id: string | null;
        };
        Insert: {
          business_entity_id: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          total_input_tokens?: number;
          total_output_tokens?: number;
          user_id?: string | null;
        };
        Update: {
          business_entity_id?: string;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          title?: string | null;
          total_input_tokens?: number;
          total_output_tokens?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_sessions_business_entity_id_fkey';
            columns: ['business_entity_id'];
            isOneToOne: false;
            referencedRelation: 'business_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      entity_memberships: {
        Row: {
          business_entity_id: string;
          invited_by: string | null;
          joined_at: string;
          role: string;
          user_id: string;
        };
        Insert: {
          business_entity_id: string;
          invited_by?: string | null;
          joined_at?: string;
          role: string;
          user_id: string;
        };
        Update: {
          business_entity_id?: string;
          invited_by?: string | null;
          joined_at?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'entity_memberships_business_entity_id_fkey';
            columns: ['business_entity_id'];
            isOneToOne: false;
            referencedRelation: 'business_entities';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_entity_member: {
        Args: {
          entity: string;
        };
        Returns: boolean;
      };
      is_entity_owner: {
        Args: {
          entity: string;
        };
        Returns: boolean;
      };
      shares_entity_with: {
        Args: {
          target: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions['schema']]['Tables'] &
        Database[PublicTableNameOrOptions['schema']]['Views'])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions['schema']]['Tables'] &
      Database[PublicTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema['Tables'] & PublicSchema['Views'])
    ? (PublicSchema['Tables'] & PublicSchema['Views'])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends keyof PublicSchema['Tables'] | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions['schema']]['Tables']
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema['Tables']
    ? PublicSchema['Tables'][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  PublicEnumNameOrOptions extends keyof PublicSchema['Enums'] | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions['schema']]['Enums'][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema['Enums']
    ? PublicSchema['Enums'][PublicEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema['CompositeTypes']
    ? PublicSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;
