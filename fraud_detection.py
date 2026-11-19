def assess_risk(amount, recipient):
    """Explainable classroom heuristic; not a real fraud detector."""
    score=0.0
    reasons=[]
    if amount >= 50000:
        score += 0.75; reasons.append("Large simulated amount")
    elif amount >= 20000:
        score += 0.35; reasons.append("Above-usual demo amount")
    if len(recipient.strip()) < 2:
        score += 0.2; reasons.append("Recipient details are too short")
    level="HIGH" if score>=0.7 else "MEDIUM" if score>=0.3 else "LOW"
    return {"score":round(min(score,1),2),"level":level,"reasons":reasons or ["No demo risk rule triggered"]}
