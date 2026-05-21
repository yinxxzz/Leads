/**
 * 数据库查询辅助函数
 * 封装常见的 CRUD 操作，自动适配 pg 直连或 Supabase SDK
 */

import { getConnectionType, getPgPool, getSupabaseClient } from './db';

/**
 * 查询选项
 */
export interface QueryOptions {
  orderBy?: string;
  ascending?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * 查询条件操作符
 */
export type QueryOperator =
  | { $eq: unknown } // 等于 (=)
  | { $ne: unknown } // 不等于 (!=)
  | { $gt: unknown } // 大于 (>)
  | { $gte: unknown } // 大于等于 (>=)
  | { $lt: unknown } // 小于 (<)
  | { $lte: unknown } // 小于等于 (<=)
  | { $like: string } // 模糊匹配 (LIKE)
  | { $ilike: string } // 不区分大小写模糊匹配 (ILIKE)
  | { $in: unknown[] } // 在数组中 (IN)
  | { $nin: unknown[] }; // 不在数组中 (NOT IN)

/**
 * 查询条件类型
 */
export type QueryConditions = Record<string, unknown | QueryOperator>;

/**
 * 使用 Supabase SDK 执行查询
 */
async function queryWithSdk<T>(
  table: string,
  conditions?: QueryConditions,
  options?: QueryOptions
): Promise<T[]> {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client not initialized');

  let query = client.from(table).select('*');

  // 添加 WHERE 条件
  if (conditions) {
    for (const [key, value] of Object.entries(conditions)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const operator = value as QueryOperator;

        if ('$eq' in operator) query = query.eq(key, operator.$eq);
        else if ('$ne' in operator) query = query.neq(key, operator.$ne);
        else if ('$gt' in operator) query = query.gt(key, operator.$gt);
        else if ('$gte' in operator) query = query.gte(key, operator.$gte);
        else if ('$lt' in operator) query = query.lt(key, operator.$lt);
        else if ('$lte' in operator) query = query.lte(key, operator.$lte);
        else if ('$like' in operator) query = query.like(key, operator.$like);
        else if ('$ilike' in operator)
          query = query.ilike(key, operator.$ilike);
        else if ('$in' in operator) query = query.in(key, operator.$in);
        else if ('$nin' in operator) {
          // Supabase 不支持 NOT IN，需要反向处理
          query = query.not(key, 'in', operator.$nin);
        }
      } else {
        query = query.eq(key, value);
      }
    }
  }

  // 添加排序
  if (options?.orderBy) {
    query = query.order(options.orderBy, {
      ascending: options.ascending ?? false,
    });
  }

  // 添加分页
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(
      options.offset,
      options.offset + (options.limit || 1000) - 1
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data as T[]) || [];
}

/**
 * 构建 WHERE 条件子句（pg 直连使用）
 */
function buildWhereClause(
  conditions: QueryConditions,
  values: unknown[]
): string {
  const whereParts: string[] = [];

  for (const [key, value] of Object.entries(conditions)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const operator = value as QueryOperator;

      if ('$eq' in operator) {
        whereParts.push(`${key} = $${values.length + 1}`);
        values.push(operator.$eq);
      } else if ('$ne' in operator) {
        whereParts.push(`${key} != $${values.length + 1}`);
        values.push(operator.$ne);
      } else if ('$gt' in operator) {
        whereParts.push(`${key} > $${values.length + 1}`);
        values.push(operator.$gt);
      } else if ('$gte' in operator) {
        whereParts.push(`${key} >= $${values.length + 1}`);
        values.push(operator.$gte);
      } else if ('$lt' in operator) {
        whereParts.push(`${key} < $${values.length + 1}`);
        values.push(operator.$lt);
      } else if ('$lte' in operator) {
        whereParts.push(`${key} <= $${values.length + 1}`);
        values.push(operator.$lte);
      } else if ('$like' in operator) {
        whereParts.push(`${key} LIKE $${values.length + 1}`);
        values.push(operator.$like);
      } else if ('$ilike' in operator) {
        whereParts.push(`${key} ILIKE $${values.length + 1}`);
        values.push(operator.$ilike);
      } else if ('$in' in operator) {
        whereParts.push(`${key} = ANY($${values.length + 1})`);
        values.push(operator.$in);
      } else if ('$nin' in operator) {
        whereParts.push(`${key} != ALL($${values.length + 1})`);
        values.push(operator.$nin);
      }
    } else {
      whereParts.push(`${key} = $${values.length + 1}`);
      values.push(value);
    }
  }

  return whereParts.join(' AND ');
}

/**
 * 查询单条记录
 * @param table 表名
 * @param conditions WHERE 条件对象
 * @returns 查询结果或 null
 *
 * @example
 * ```typescript
 * const project = await selectOne<DbProject>('projects', { id: 'my-project' });
 * ```
 */
export async function selectOne<T>(
  table: string,
  conditions: Record<string, unknown>
): Promise<T | null> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const results = await queryWithSdk<T>(table, conditions, { limit: 1 });
    return results[0] || null;
  }

  // pg 直连模式
  const keys = Object.keys(conditions);
  const values = Object.values(conditions);

  if (keys.length === 0) {
    throw new Error('selectOne requires at least one condition');
  }

  const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
  const query = `SELECT * FROM ${table} WHERE ${whereClause} LIMIT 1`;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * 查询多条记录
 * @param table 表名
 * @param conditions WHERE 条件对象（可选）
 * @param options 查询选项（排序、分页等）
 * @returns 查询结果数组
 *
 * @example
 * ```typescript
 * // 简单查询
 * const projects = await selectMany<DbProject>('projects',
 *   { status: 'running' },
 *   { orderBy: 'created_at', ascending: false, limit: 10 }
 * );
 *
 * // 使用操作符
 * const projects = await selectMany<DbProject>('projects',
 *   {
 *     name: { $ilike: '%项目%' },
 *     user_id: 'user-123'
 *   },
 *   { orderBy: 'created_at', ascending: false }
 * );
 * ```
 */
export async function selectMany<T>(
  table: string,
  conditions?: QueryConditions,
  options?: QueryOptions
): Promise<T[]> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    return queryWithSdk<T>(table, conditions, options);
  }

  // pg 直连模式
  let query = `SELECT * FROM ${table}`;
  const values: unknown[] = [];

  if (conditions && Object.keys(conditions).length > 0) {
    const whereClause = buildWhereClause(conditions, values);
    query += ` WHERE ${whereClause}`;
  }

  if (options?.orderBy) {
    const direction = options.ascending ? 'ASC' : 'DESC';
    query += ` ORDER BY ${options.orderBy} ${direction}`;
  }

  if (options?.limit) {
    query += ` LIMIT $${values.length + 1}`;
    values.push(options.limit);
  }

  if (options?.offset) {
    query += ` OFFSET $${values.length + 1}`;
    values.push(options.offset);
  }

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rows;
}

/**
 * 插入单条记录
 * @param table 表名
 * @param data 要插入的数据
 * @returns 插入的记录
 *
 * @example
 * ```typescript
 * const newProject = await insertOne<DbProject>('projects', {
 *   id: 'new-project',
 *   name: 'My Project',
 *   status: 'active'
 * });
 * ```
 */
export async function insertOne<T>(
  table: string,
  data: Record<string, unknown>
): Promise<T> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    const { data: result, error } = await client
      .from(table)
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return result as T;
  }

  // pg 直连模式
  const keys = Object.keys(data);
  const values = Object.values(data);

  if (keys.length === 0) {
    throw new Error('insertOne requires at least one field');
  }

  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO ${table} (${columns})
    VALUES (${placeholders})
    RETURNING *
  `;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * 批量插入记录
 * @param table 表名
 * @param dataArray 要插入的数据数组
 * @returns 插入的记录数组
 *
 * @example
 * ```typescript
 * const messages = await insertMany<DbMessage>('messages', [
 *   { conversation_id: '123', content: 'Hello', role: 'user' },
 *   { conversation_id: '123', content: 'Hi', role: 'assistant' }
 * ]);
 * ```
 */
export async function insertMany<T>(
  table: string,
  dataArray: Record<string, unknown>[]
): Promise<T[]> {
  if (dataArray.length === 0) {
    return [];
  }

  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    const { data: result, error } = await client
      .from(table)
      .insert(dataArray)
      .select();
    if (error) throw error;
    return (result as T[]) || [];
  }

  // pg 直连模式
  const keys = Object.keys(dataArray[0]);
  const columns = keys.join(', ');

  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const data of dataArray) {
    const rowPlaceholders = keys.map(() => `$${paramIndex++}`).join(', ');
    placeholders.push(`(${rowPlaceholders})`);
    values.push(...keys.map((k) => data[k]));
  }

  const query = `
    INSERT INTO ${table} (${columns})
    VALUES ${placeholders.join(', ')}
    RETURNING *
  `;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rows;
}

/**
 * 更新单条记录
 * @param table 表名
 * @param conditions WHERE 条件对象
 * @param data 要更新的数据
 * @returns 更新的记录
 *
 * @example
 * ```typescript
 * const updated = await updateOne<DbProject>('projects',
 *   { id: 'my-project' },
 *   { status: 'active', updated_at: new Date().toISOString() }
 * );
 * ```
 */
export async function updateOne<T>(
  table: string,
  conditions: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<T | null> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    let query = client.from(table).update(data);

    // 添加 WHERE 条件
    for (const [key, value] of Object.entries(conditions)) {
      query = query.eq(key, value);
    }

    const { data: result, error } = await query.select().single();
    if (error) throw error;
    return result as T;
  }

  // pg 直连模式
  const dataKeys = Object.keys(data);
  const conditionKeys = Object.keys(conditions);

  if (dataKeys.length === 0) {
    throw new Error('updateOne requires at least one field to update');
  }

  if (conditionKeys.length === 0) {
    throw new Error('updateOne requires at least one condition');
  }

  const setClause = dataKeys.map((key, i) => `${key} = $${i + 1}`).join(', ');
  const whereClause = conditionKeys
    .map((key, i) => `${key} = $${dataKeys.length + i + 1}`)
    .join(' AND ');

  const values = [...Object.values(data), ...Object.values(conditions)];

  const query = `
    UPDATE ${table}
    SET ${setClause}
    WHERE ${whereClause}
    RETURNING *
  `;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rows[0] || null;
}

/**
 * 删除记录
 * @param table 表名
 * @param conditions WHERE 条件对象
 * @returns 是否删除成功
 *
 * @example
 * ```typescript
 * await deleteRecords('projects', { id: 'my-project' });
 * ```
 */
export async function deleteRecords(
  table: string,
  conditions: Record<string, unknown>
): Promise<boolean> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    let query = client.from(table).delete();

    // 添加 WHERE 条件
    for (const [key, value] of Object.entries(conditions)) {
      query = query.eq(key, value);
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  }

  // pg 直连模式
  const keys = Object.keys(conditions);
  const values = Object.values(conditions);

  if (keys.length === 0) {
    throw new Error('deleteRecords requires at least one condition');
  }

  const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
  const query = `DELETE FROM ${table} WHERE ${whereClause}`;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Upsert 操作（INSERT ON CONFLICT UPDATE）
 * @param table 表名
 * @param data 要插入或更新的数据
 * @param conflictColumns 冲突列（通常是主键或唯一键）
 * @param updateData 冲突时要更新的数据（可选，默认更新所有字段）
 * @returns Upsert 后的记录
 *
 * @example
 * ```typescript
 * const project = await upsert<DbProject>('projects',
 *   { id: 'my-project', name: 'My Project', status: 'active' },
 *   ['id']
 * );
 * ```
 */
export async function upsert<T>(
  table: string,
  data: Record<string, unknown>,
  conflictColumns: string[],
  updateData?: Record<string, unknown>
): Promise<T> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    const { data: result, error } = await client
      .from(table)
      .upsert(data, { onConflict: conflictColumns.join(',') })
      .select()
      .single();

    if (error) throw error;
    return result as T;
  }

  // pg 直连模式
  const keys = Object.keys(data);
  const values = Object.values(data);

  if (keys.length === 0) {
    throw new Error('upsert requires at least one field');
  }

  if (conflictColumns.length === 0) {
    throw new Error('upsert requires at least one conflict column');
  }

  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

  const fieldsToUpdate = updateData
    ? Object.keys(updateData)
    : keys.filter((k) => !conflictColumns.includes(k));
  const updateValues = updateData
    ? Object.values(updateData)
    : fieldsToUpdate.map((k) => data[k]);

  const updateClause = fieldsToUpdate
    .map((key, i) => {
      const paramIndex = values.length + i + 1;
      return `${key} = $${paramIndex}`;
    })
    .join(', ');

  const allValues = [...values, ...updateValues];

  const query = `
    INSERT INTO ${table} (${columns})
    VALUES (${placeholders})
    ON CONFLICT (${conflictColumns.join(', ')})
    DO UPDATE SET ${updateClause}
    RETURNING *
  `;

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, allValues);
  return result.rows[0];
}

/**
 * 计数查询
 * @param table 表名
 * @param conditions WHERE 条件对象（可选）
 * @returns 符合条件的记录数
 *
 * @example
 * ```typescript
 * // 简单计数
 * const total = await count('projects', { status: 'active' });
 *
 * // 使用操作符
 * const total = await count('projects', {
 *   name: { $ilike: '%项目%' },
 *   user_id: 'user-123'
 * });
 * ```
 */
export async function count(
  table: string,
  conditions?: QueryConditions
): Promise<number> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase client not initialized');

    let query = client.from(table).select('*', { count: 'exact', head: true });

    // 添加 WHERE 条件
    if (conditions) {
      for (const [key, value] of Object.entries(conditions)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const operator = value as QueryOperator;

          if ('$eq' in operator) query = query.eq(key, operator.$eq);
          else if ('$ne' in operator) query = query.neq(key, operator.$ne);
          else if ('$gt' in operator) query = query.gt(key, operator.$gt);
          else if ('$gte' in operator) query = query.gte(key, operator.$gte);
          else if ('$lt' in operator) query = query.lt(key, operator.$lt);
          else if ('$lte' in operator) query = query.lte(key, operator.$lte);
          else if ('$like' in operator) query = query.like(key, operator.$like);
          else if ('$ilike' in operator)
            query = query.ilike(key, operator.$ilike);
          else if ('$in' in operator) query = query.in(key, operator.$in);
        } else {
          query = query.eq(key, value);
        }
      }
    }

    const { count: resultCount, error } = await query;
    if (error) throw error;
    return resultCount || 0;
  }

  // pg 直连模式
  let query = `SELECT COUNT(*) FROM ${table}`;
  const values: unknown[] = [];

  if (conditions && Object.keys(conditions).length > 0) {
    const whereClause = buildWhereClause(conditions, values);
    query += ` WHERE ${whereClause}`;
  }

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, values);
  return parseInt(result.rows[0]?.count || '0', 10);
}

/**
 * 执行原始 SQL 查询（仅支持 pg 直连）
 * @param query SQL 查询字符串
 * @param params 查询参数
 * @returns 查询结果
 *
 * @example
 * ```typescript
 * const result = await rawQuery<DbProject>(
 *   'SELECT * FROM projects WHERE name ILIKE $1 ORDER BY created_at DESC',
 *   [`%${searchTerm}%`]
 * );
 * ```
 */
export async function rawQuery<T>(
  query: string,
  params?: unknown[]
): Promise<T[]> {
  const connType = getConnectionType();

  if (connType === 'sdk') {
    throw new Error(
      'Raw SQL queries are not supported with Supabase SDK. Please use db-helpers functions instead.'
    );
  }

  const pool = getPgPool();
  if (!pool) throw new Error('PostgreSQL pool not initialized');

  const result = await pool.query(query, params || []);
  return result.rows;
}
