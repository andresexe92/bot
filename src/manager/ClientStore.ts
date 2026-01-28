/**
 * ClientStore - Gestión de la configuración de clientes
 * Maneja lectura/escritura del archivo clients.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { ClientConfig, ClientsDatabase } from './types.js';

export class ClientStore {
  private configPath: string;
  private clients: Map<string, ClientConfig> = new Map();

  constructor(configPath: string) {
    this.configPath = configPath;
    this.ensureConfigExists();
    this.load();
  }

  /**
   * Asegura que el archivo de configuración exista
   */
  private ensureConfigExists(): void {
    const dir = dirname(this.configPath);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (!existsSync(this.configPath)) {
      const initialData: ClientsDatabase = {
        version: '1.0.0',
        clients: []
      };
      writeFileSync(this.configPath, JSON.stringify(initialData, null, 2), 'utf-8');
      console.log(`[ClientStore] Archivo de configuración creado: ${this.configPath}`);
    }
  }

  /**
   * Carga los clientes desde el archivo JSON
   */
  load(): void {
    try {
      const content = readFileSync(this.configPath, 'utf-8');
      const data: ClientsDatabase = JSON.parse(content);

      this.clients.clear();
      for (const client of data.clients) {
        this.clients.set(client.nit, client);
      }

      console.log(`[ClientStore] Cargados ${this.clients.size} clientes desde ${this.configPath}`);
    } catch (error) {
      console.error(`[ClientStore] Error cargando configuración:`, error);
      throw error;
    }
  }

  /**
   * Persiste los clientes al archivo JSON
   */
  private save(): void {
    try {
      const data: ClientsDatabase = {
        version: '1.0.0',
        clients: Array.from(this.clients.values())
      };
      writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[ClientStore] Configuración guardada`);
    } catch (error) {
      console.error(`[ClientStore] Error guardando configuración:`, error);
      throw error;
    }
  }

  /**
   * Obtiene todos los clientes
   */
  getAll(): ClientConfig[] {
    return Array.from(this.clients.values());
  }

  /**
   * Obtiene solo los clientes activos
   */
  getActive(): ClientConfig[] {
    return this.getAll().filter(c => c.activo);
  }

  /**
   * Obtiene un cliente por NIT
   */
  get(nit: string): ClientConfig | undefined {
    return this.clients.get(nit);
  }

  /**
   * Verifica si un cliente existe
   */
  exists(nit: string): boolean {
    return this.clients.has(nit);
  }

  /**
   * Verifica si un puerto está en uso por otro cliente
   */
  isPortInUse(puerto: number, excludeNit?: string): boolean {
    for (const [nit, client] of this.clients) {
      if (client.puerto === puerto && nit !== excludeNit) {
        return true;
      }
    }
    return false;
  }

  /**
   * Agrega un nuevo cliente
   */
  add(config: Omit<ClientConfig, 'createdAt' | 'updatedAt'>): ClientConfig {
    if (this.exists(config.nit)) {
      throw new Error(`Cliente con NIT ${config.nit} ya existe`);
    }

    if (this.isPortInUse(config.puerto)) {
      throw new Error(`Puerto ${config.puerto} ya está en uso por otro cliente`);
    }

    const newClient: ClientConfig = {
      ...config,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.clients.set(config.nit, newClient);
    this.save();

    console.log(`[ClientStore] Cliente agregado: ${config.nit} (${config.nombre})`);
    return newClient;
  }

  /**
   * Actualiza un cliente existente
   */
  update(nit: string, updates: Partial<Omit<ClientConfig, 'nit' | 'createdAt'>>): ClientConfig {
    const existing = this.clients.get(nit);
    if (!existing) {
      throw new Error(`Cliente con NIT ${nit} no existe`);
    }

    if (updates.puerto && this.isPortInUse(updates.puerto, nit)) {
      throw new Error(`Puerto ${updates.puerto} ya está en uso por otro cliente`);
    }

    const updated: ClientConfig = {
      ...existing,
      ...updates,
      nit, // No permitir cambiar NIT
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    };

    this.clients.set(nit, updated);
    this.save();

    console.log(`[ClientStore] Cliente actualizado: ${nit}`);
    return updated;
  }

  /**
   * Elimina un cliente
   */
  delete(nit: string): boolean {
    if (!this.exists(nit)) {
      return false;
    }

    this.clients.delete(nit);
    this.save();

    console.log(`[ClientStore] Cliente eliminado: ${nit}`);
    return true;
  }

  /**
   * Activa o desactiva un cliente
   */
  setActive(nit: string, activo: boolean): ClientConfig {
    return this.update(nit, { activo });
  }

  /**
   * Obtiene el siguiente puerto disponible
   */
  getNextAvailablePort(startFrom: number = 3001): number {
    const usedPorts = new Set(this.getAll().map(c => c.puerto));
    let port = startFrom;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }
}
