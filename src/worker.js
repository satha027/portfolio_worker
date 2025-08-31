/**
 * ===================================================================================
 * Cloudflare D1 Worker API for Portfolio Database (v4 - Final CORS Fix)
 *
 * This version corrects the missing 'env' parameter in response helpers,
 * ensuring CORS headers are present on all API responses, not just pre-flight.
 * ===================================================================================
 */

export default {
    async fetch(request, env) {
        // Handle CORS pre-flight requests first.
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        try {
            // Authentication Middleware for write methods
            const writeMethods = ['POST', 'PUT', 'DELETE'];
            if (writeMethods.includes(request.method)) {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || authHeader !== `Bearer ${env.SECRET_KEY}`) {
                    return errorResponse('Unauthorized', 401, env);
                }
            }

            // Main API Router
            const url = new URL(request.url);
            if (url.pathname.startsWith('/api/')) {
                 return await handleApiRequest(url, request, env);
            }

            return errorResponse('Route not found', 404, env);

        } catch (e) {
            return errorResponse(e.message, 500, env);
        }
    }
};

/**
 * Handles all API requests routed from the main fetch handler.
 */
async function handleApiRequest(url, request, env) {
    const { pathname } = url;
    const db = env.DB;

    // GET /api/categories
    if (request.method === 'GET' && pathname === '/api/categories') {
        const { results } = await db.prepare("SELECT * FROM categories ORDER BY project_count DESC, category_name ASC").all();
        return jsonResponse(results, 200, env);
    }
    
    // POST /api/categories
    if (request.method === 'POST' && pathname === '/api/categories') {
        const { name } = await request.json();
        const result = await db.prepare("INSERT INTO categories (category_name) VALUES (?)").bind(name).run();
        return jsonResponse(result, 201, env);
    }
    
    // GET /api/projects
    if (request.method === 'GET' && pathname === '/api/projects') {
        const includeHidden = url.searchParams.get('includeHidden') === 'true';
        const stmt = db.prepare("SELECT * FROM projects WHERE visibility = 1 OR ? ORDER BY order_number ASC, s_no DESC").bind(includeHidden);
        const { results } = await stmt.all();
        return jsonResponse(results, 200, env);
    }

    // POST /api/projects
    if (request.method === 'POST' && pathname === '/api/projects') {
        const p = await request.json();
        const result = await db.prepare(
            "INSERT INTO projects (name, long_description, images, github_link, technologies, category_name, short_description, circuit_diagram_link, video_link, order_number, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(p.name, p.long_description, p.images, p.github_link, p.technologies, p.category_name, p.short_description, p.circuit_diagram_link, p.video_link, p.order_number, p.visibility).run();
        return jsonResponse(result, 201, env);
    }
    
    // Handle routes with an ID, like /api/projects/123
    const idMatch = pathname.match(/^\/api\/(projects|categories)\/(\d+)$/);
    if (idMatch) {
        const resourceType = idMatch[1];
        const id = idMatch[2];

        if (request.method === 'PUT') {
            const body = await request.json();
            if (resourceType === 'projects') {
                const result = await db.prepare(
                    "UPDATE projects SET name=?, long_description=?, images=?, github_link=?, technologies=?, category_name=?, circuit_diagram_link=?, order_number=?, visibility=? WHERE s_no = ?"
                ).bind(body.name, body.long_description, body.images, body.github_link, body.technologies, body.category_name, body.circuit_diagram_link, body.order_number, body.visibility, id).run();
                return jsonResponse(result, 200, env);
            }
             if (resourceType === 'categories') {
                const result = await db.prepare("UPDATE categories SET category_name = ? WHERE s_no = ?").bind(body.name, id).run();
                return jsonResponse(result, 200, env);
            }
        }
        
        if (request.method === 'DELETE') {
            await db.prepare(`DELETE FROM ${resourceType} WHERE s_no = ?`).bind(id).run();
            // For DELETE, we return a response with no body, but still need CORS headers
            return new Response(null, { status: 204, headers: getCorsHeaders(env) });
        }
    }

    return errorResponse('Route not found', 404, env);
}


// --- HELPER FUNCTIONS ---

function getCorsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

function handleOptions(request, env) {
    return new Response(null, { headers: getCorsHeaders(env) });
}

function jsonResponse(data, status = 200, env) {
    const headers = getCorsHeaders(env);
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400, env) {
    const headers = getCorsHeaders(env);
    headers['Content-Type'] = 'application/json';
    return new Response(JSON.stringify({ error: message }), { status, headers });
}