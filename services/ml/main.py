from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
import uvicorn
import redis
import logging
import os
from datetime import datetime

from classifier import NotificationClassifier, NotificationCategory, UserFeedback

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="NotiSync Classification Service", 
    version="1.0.0",
    description="Smart notification classification service with learning capabilities"
)

# Initialize Redis connection
redis_client = None
try:
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_client = redis.Redis(host=redis_host, port=redis_port, decode_responses=True)
    redis_client.ping()  # Test connection
    logger.info(f"Connected to Redis at {redis_host}:{redis_port}")
except Exception as e:
    logger.warning(f"Failed to connect to Redis: {e}. Running without learning capabilities.")
    redis_client = None

# Initialize classifier
classifier = NotificationClassifier(redis_client)

class NotificationData(BaseModel):
    app_name: str
    title: Optional[str] = None
    body: Optional[str] = None

class ClassificationResponse(BaseModel):
    category: str
    confidence: float
    reasoning: str
    matched_keywords: List[str]

class FeedbackRequest(BaseModel):
    app_name: str
    title: Optional[str] = None
    body: Optional[str] = None
    predicted_category: str
    actual_category: str

class StatsResponse(BaseModel):
    category_stats: Dict
    total_learned_patterns: int
    redis_connected: bool

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    redis_status = "connected" if redis_client else "disconnected"
    try:
        if redis_client:
            redis_client.ping()
    except:
        redis_status = "error"
    
    return {
        "status": "healthy", 
        "service": "classification",
        "redis": redis_status,
        "version": "1.0.0"
    }

@app.post("/classify", response_model=ClassificationResponse)
async def classify_notification(notification: NotificationData):
    """
    Classify a notification into Work, Personal, or Junk category.
    
    Args:
        notification: NotificationData containing app_name, title, and body
        
    Returns:
        ClassificationResponse with category, confidence, reasoning, and matched keywords
    """
    try:
        result = classifier.classify(
            app_name=notification.app_name,
            title=notification.title or "",
            body=notification.body or ""
        )
        
        return ClassificationResponse(
            category=result.category.value,
            confidence=result.confidence,
            reasoning=result.reasoning,
            matched_keywords=result.matched_keywords
        )
    except Exception as e:
        logger.error(f"Classification error: {e}")
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")

@app.post("/feedback")
async def submit_feedback(feedback: FeedbackRequest):
    """
    Submit user feedback to improve classification accuracy.
    
    Args:
        feedback: FeedbackRequest containing the notification data and correct category
        
    Returns:
        Success message
    """
    try:
        # Validate category
        try:
            predicted_cat = NotificationCategory(feedback.predicted_category)
            actual_cat = NotificationCategory(feedback.actual_category)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid category: {str(e)}")
        
        # Create feedback object
        user_feedback = UserFeedback(
            app_name=feedback.app_name,
            title=feedback.title or "",
            body=feedback.body or "",
            predicted_category=predicted_cat,
            actual_category=actual_cat,
            timestamp=datetime.now()
        )
        
        # Learn from feedback
        classifier.learn_from_feedback(user_feedback)
        
        return {
            "status": "success",
            "message": f"Feedback received: {feedback.app_name} → {feedback.actual_category}"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Feedback processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Feedback processing failed: {str(e)}")

@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    """
    Get classification statistics and learned patterns.
    
    Returns:
        StatsResponse with category statistics and learning information
    """
    try:
        stats = classifier.get_category_stats()
        total_patterns = sum(
            cat_stats.get('learned_apps', 0) + cat_stats.get('learned_content_patterns', 0)
            for cat_stats in stats.values()
        )
        
        return StatsResponse(
            category_stats=stats,
            total_learned_patterns=total_patterns,
            redis_connected=redis_client is not None
        )
    except Exception as e:
        logger.error(f"Stats retrieval error: {e}")
        raise HTTPException(status_code=500, detail=f"Stats retrieval failed: {str(e)}")

@app.post("/reset")
async def reset_learned_patterns():
    """
    Reset all learned patterns (for testing or cleanup).
    
    Returns:
        Success message
    """
    try:
        classifier.reset_learned_patterns()
        return {
            "status": "success",
            "message": "All learned patterns have been reset"
        }
    except Exception as e:
        logger.error(f"Reset error: {e}")
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")

@app.get("/categories")
async def get_categories():
    """
    Get available notification categories.
    
    Returns:
        List of available categories
    """
    return {
        "categories": [category.value for category in NotificationCategory],
        "descriptions": {
            "Work": "Business, professional, and work-related notifications",
            "Personal": "Personal messages, social media, and general notifications",
            "Junk": "Promotional, spam, and unwanted notifications"
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8081)