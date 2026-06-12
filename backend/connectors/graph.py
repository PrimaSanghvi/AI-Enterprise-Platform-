from backend.db import SCHEMA, query

DISPLAY_NAME = "Neo4j Graph"


def get_relationships(company_id: str) -> dict | None:
    rows = query(
        f"""
        SELECT er.entity_id, er.name, er.type, er.details, c.name AS company_name
        FROM {SCHEMA}.entity_relationships er
        JOIN {SCHEMA}.companies c ON c.company_id = er.company_id
        WHERE er.company_id = %s
        """,
        (company_id,),
    )
    if not rows:
        return None
    return {
        "company_id": company_id,
        "company_name": rows[0]["company_name"],
        "relationships": [
            {"entity_id": r["entity_id"], "name": r["name"], "type": r["type"], "details": r["details"]}
            for r in rows
        ],
    }


def get_full_graph() -> dict:
    companies = {c["company_id"]: c for c in query(f"SELECT * FROM {SCHEMA}.companies")}
    rels = query(f"SELECT * FROM {SCHEMA}.entity_relationships")

    nodes: dict[str, dict] = {}
    edges: list[dict] = []

    for cid, company in companies.items():
        nodes[cid] = {
            "id": cid,
            "label": company["name"],
            "type": "company",
            "sector": company.get("sector", ""),
            "stage": company.get("stage", ""),
            "details": company.get("description", ""),
        }

    for rel in rels:
        eid = rel["entity_id"]
        if eid not in nodes:
            nodes[eid] = {
                "id": eid,
                "label": rel["name"],
                "type": rel["type"],
                "details": rel["details"],
            }
        edges.append({
            "source": rel["company_id"],
            "target": eid,
            "relationship": rel["type"],
            "details": rel["details"],
        })

    return {"nodes": list(nodes.values()), "edges": edges}
