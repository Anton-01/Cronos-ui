export interface StatusEntity {
  id: string | number;
  status: 'ACTIVE' | 'INACTIVE' | string;
  [key: string]: any;
}
