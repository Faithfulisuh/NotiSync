"""
Notification classification service for NotiSync.
Implements keyword-based categorization with learning capabilities.
"""

import re
import json
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import redis
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class NotificationCategory(str, Enum):
    """Notification categories"""
    WORK = "Work"
    PERSONAL = "Personal"
    JUNK = "Junk"


@dataclass
class ClassificationResult:
    """Result of notification classification"""
    category: NotificationCategory
    confidence: float
    reasoning: str
    matched_keywords: List[str]


@dataclass
class UserFeedback:
    """User feedback for learning"""
    app_name: str
    title: str
    body: str
    predicted_category: NotificationCategory
    actual_category: NotificationCategory
    timestamp: datetime


class NotificationClassifier:
    """
    Keyword-based notification classifier with learning capabilities.
    """
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        self.redis_client = redis_client
        self._initialize_keywords()
        self._load_learned_patterns()
    
    def _initialize_keywords(self):
        """Initialize keyword patterns for each category"""
        
        # Work-related keywords and patterns
        self.work_keywords = {
            'apps': [
                'slack', 'teams', 'microsoft teams', 'outlook', 'gmail', 'email',
                'zoom', 'webex', 'skype', 'calendar', 'jira', 'confluence',
                'trello', 'asana', 'notion', 'monday', 'salesforce', 'hubspot',
                'office', 'excel', 'word', 'powerpoint', 'sharepoint',
                'linkedin', 'workday', 'bamboohr', 'zendesk', 'freshdesk'
            ],
            'content': [
                'meeting', 'conference', 'deadline', 'project', 'task',
                'client', 'customer', 'report', 'presentation', 'document',
                'schedule', 'appointment', 'colleague', 'team', 'manager',
                'office', 'work', 'business', 'professional', 'corporate',
                'invoice', 'contract', 'proposal', 'budget', 'quarterly',
                'standup', 'scrum', 'sprint', 'deployment', 'release',
                'urgent', 'asap', 'priority', 'escalation', 'incident'
            ],
            'domains': [
                'company.com', 'corp.com', 'enterprise.com', 'business.com',
                'work.com', 'office.com', 'team.com'
            ]
        }
        
        # Personal keywords and patterns
        self.personal_keywords = {
            'apps': [
                'whatsapp', 'telegram', 'signal', 'messenger', 'imessage',
                'instagram', 'facebook', 'twitter', 'snapchat', 'tiktok',
                'youtube', 'spotify', 'netflix', 'amazon', 'uber', 'lyft',
                'maps', 'weather', 'news', 'reddit', 'discord', 'twitch',
                'banking', 'bank', 'paypal', 'venmo', 'cashapp', 'zelle',
                'fitness', 'health', 'calendar', 'photos', 'camera'
            ],
            'content': [
                'friend', 'family', 'mom', 'dad', 'brother', 'sister',
                'birthday', 'anniversary', 'vacation', 'holiday', 'weekend',
                'dinner', 'lunch', 'coffee', 'movie', 'game', 'party',
                'personal', 'private', 'home', 'house', 'apartment',
                'love', 'miss', 'care', 'thanks', 'congratulations',
                'reminder', 'appointment', 'doctor', 'dentist', 'gym',
                'workout', 'exercise', 'recipe', 'cooking', 'shopping'
            ]
        }
        
        # Junk/promotional keywords and patterns
        self.junk_keywords = {
            'apps': [
                'marketing', 'promo', 'deals', 'offers', 'shopping',
                'retail', 'store', 'mall', 'advertisement', 'ad',
                'spam', 'newsletter', 'subscription', 'promotion'
            ],
            'content': [
                'sale', 'discount', 'offer', 'deal', 'promotion', 'coupon',
                'limited time', 'buy now', 'shop', 'free shipping', '% off',
                'unsubscribe', 'marketing', 'newsletter', 'advertisement',
                'click here', 'act now', 'hurry', 'expires', 'last chance',
                'winner', 'congratulations', 'prize', 'lottery', 'jackpot',
                'free', 'bonus', 'reward', 'cashback', 'refund',
                'viagra', 'casino', 'gambling', 'loan', 'credit',
                'weight loss', 'diet', 'supplement', 'miracle'
            ],
            'patterns': [
                r'\d+%\s*off',  # "50% off", "25% OFF"
                r'free\s+shipping',  # "free shipping"
                r'buy\s+\d+\s+get\s+\d+',  # "buy 1 get 1"
                r'\$\d+\.\d{2}',  # "$19.99"
                r'limited\s+time',  # "limited time"
                r'act\s+now',  # "act now"
                r'click\s+here',  # "click here"
            ]
        }
    
    def _load_learned_patterns(self):
        """Load learned patterns from Redis"""
        self.learned_patterns = {
            NotificationCategory.WORK: {'apps': {}, 'content': {}},
            NotificationCategory.PERSONAL: {'apps': {}, 'content': {}},
            NotificationCategory.JUNK: {'apps': {}, 'content': {}}
        }
        
        if self.redis_client:
            try:
                for category in NotificationCategory:
                    key = f"learned_patterns:{category.value}"
                    patterns = self.redis_client.get(key)
                    if patterns:
                        self.learned_patterns[category] = json.loads(patterns)
            except Exception as e:
                logger.warning(f"Failed to load learned patterns: {e}")
    
    def _save_learned_patterns(self):
        """Save learned patterns to Redis"""
        if self.redis_client:
            try:
                for category, patterns in self.learned_patterns.items():
                    key = f"learned_patterns:{category.value}"
                    self.redis_client.setex(
                        key, 
                        timedelta(days=30), 
                        json.dumps(patterns)
                    )
            except Exception as e:
                logger.warning(f"Failed to save learned patterns: {e}")
    
    def classify(self, app_name: str, title: str = "", body: str = "") -> ClassificationResult:
        """
        Classify a notification into Work, Personal, or Junk category.
        
        Args:
            app_name: Name of the source application
            title: Notification title
            body: Notification body
            
        Returns:
            ClassificationResult with category, confidence, and reasoning
        """
        app_name = app_name.lower().strip()
        content = f"{title} {body}".lower().strip()
        
        # Check learned patterns first (highest priority)
        learned_result = self._check_learned_patterns(app_name, content)
        if learned_result:
            return learned_result
        
        # Check each category with scoring
        work_score, work_matches = self._calculate_category_score(
            app_name, content, self.work_keywords
        )
        personal_score, personal_matches = self._calculate_category_score(
            app_name, content, self.personal_keywords
        )
        junk_score, junk_matches = self._calculate_category_score(
            app_name, content, self.junk_keywords
        )
        
        # Determine the category with highest score
        scores = [
            (NotificationCategory.WORK, work_score, work_matches),
            (NotificationCategory.PERSONAL, personal_score, personal_matches),
            (NotificationCategory.JUNK, junk_score, junk_matches)
        ]
        
        # Sort by score (descending)
        scores.sort(key=lambda x: x[1], reverse=True)
        
        best_category, best_score, best_matches = scores[0]
        
        # Calculate confidence based on score difference
        if len(scores) > 1:
            second_best_score = scores[1][1]
            confidence = min(0.95, max(0.5, (best_score - second_best_score) / max(best_score, 1.0)))
        else:
            confidence = 0.8
        
        # If no clear winner, default to Personal
        if best_score == 0:
            return ClassificationResult(
                category=NotificationCategory.PERSONAL,
                confidence=0.5,
                reasoning="No specific patterns matched, defaulting to Personal",
                matched_keywords=[]
            )
        
        # Generate reasoning
        reasoning = self._generate_reasoning(best_category, best_matches, app_name)
        
        return ClassificationResult(
            category=best_category,
            confidence=confidence,
            reasoning=reasoning,
            matched_keywords=best_matches
        )
    
    def _check_learned_patterns(self, app_name: str, content: str) -> Optional[ClassificationResult]:
        """Check if notification matches learned patterns"""
        for category, patterns in self.learned_patterns.items():
            if app_name in patterns.get('apps', {}):
                app_confidence = patterns['apps'][app_name]
                if app_confidence > 0.7:  # High confidence threshold
                    return ClassificationResult(
                        category=category,
                        confidence=app_confidence,
                        reasoning=f"Learned from user feedback: {app_name} → {category.value}",
                        matched_keywords=[app_name]
                    )
            
            # Check learned content patterns
            for pattern, pattern_confidence in patterns.get('content', {}).items():
                if pattern in content and pattern_confidence > 0.7:
                    return ClassificationResult(
                        category=category,
                        confidence=pattern_confidence,
                        reasoning=f"Learned from user feedback: '{pattern}' → {category.value}",
                        matched_keywords=[pattern]
                    )
        
        return None
    
    def _calculate_category_score(self, app_name: str, content: str, keywords: Dict) -> Tuple[float, List[str]]:
        """Calculate score for a specific category"""
        score = 0.0
        matches = []
        
        # Check app names (higher weight)
        for app in keywords.get('apps', []):
            if app in app_name:
                score += 3.0
                matches.append(f"app:{app}")
        
        # Check content keywords
        for keyword in keywords.get('content', []):
            if keyword in content:
                score += 1.0
                matches.append(f"keyword:{keyword}")
        
        # Check regex patterns (for junk detection)
        for pattern in keywords.get('patterns', []):
            if re.search(pattern, content, re.IGNORECASE):
                score += 2.0
                matches.append(f"pattern:{pattern}")
        
        # Check domain patterns
        for domain in keywords.get('domains', []):
            if domain in content:
                score += 1.5
                matches.append(f"domain:{domain}")
        
        return score, matches
    
    def _generate_reasoning(self, category: NotificationCategory, matches: List[str], app_name: str) -> str:
        """Generate human-readable reasoning for the classification"""
        if not matches:
            return f"Classified as {category.value} based on general patterns"
        
        app_matches = [m for m in matches if m.startswith('app:')]
        keyword_matches = [m for m in matches if m.startswith('keyword:')]
        pattern_matches = [m for m in matches if m.startswith('pattern:')]
        
        reasons = []
        
        if app_matches:
            apps = [m.split(':', 1)[1] for m in app_matches]
            reasons.append(f"app '{app_name}' matches {category.value.lower()} apps")
        
        if keyword_matches:
            keywords = [m.split(':', 1)[1] for m in keyword_matches[:3]]  # Limit to 3
            reasons.append(f"contains {category.value.lower()} keywords: {', '.join(keywords)}")
        
        if pattern_matches:
            reasons.append(f"matches {category.value.lower()} patterns")
        
        return f"Classified as {category.value}: {'; '.join(reasons)}"
    
    def learn_from_feedback(self, feedback: UserFeedback):
        """
        Learn from user feedback to improve future classifications.
        
        Args:
            feedback: UserFeedback object containing correction information
        """
        app_name = feedback.app_name.lower().strip()
        content = f"{feedback.title} {feedback.body}".lower().strip()
        correct_category = feedback.actual_category
        
        # Update learned patterns
        if correct_category not in self.learned_patterns:
            self.learned_patterns[correct_category] = {'apps': {}, 'content': {}}
        
        # Learn from app name
        if app_name:
            apps = self.learned_patterns[correct_category].setdefault('apps', {})
            current_confidence = apps.get(app_name, 0.5)
            # Increase confidence gradually
            apps[app_name] = min(0.95, current_confidence + 0.1)
        
        # Learn from content keywords
        content_words = re.findall(r'\b\w{3,}\b', content)  # Words with 3+ characters
        for word in content_words[:5]:  # Limit to 5 words to avoid overfitting
            if len(word) > 3:  # Skip very short words
                content_patterns = self.learned_patterns[correct_category].setdefault('content', {})
                current_confidence = content_patterns.get(word, 0.5)
                content_patterns[word] = min(0.9, current_confidence + 0.05)
        
        # Save updated patterns
        self._save_learned_patterns()
        
        logger.info(f"Learned from feedback: {app_name} → {correct_category.value}")
    
    def get_category_stats(self) -> Dict[str, Dict]:
        """Get statistics about learned patterns"""
        stats = {}
        for category, patterns in self.learned_patterns.items():
            apps_dict = patterns.get('apps', {})
            content_dict = patterns.get('content', {})
            
            stats[category.value] = {
                'learned_apps': len(apps_dict),
                'learned_content_patterns': len(content_dict),
                'top_apps': sorted(
                    apps_dict.items(), 
                    key=lambda x: x[1], 
                    reverse=True
                )[:5],
                'top_content_patterns': sorted(
                    content_dict.items(), 
                    key=lambda x: x[1], 
                    reverse=True
                )[:10]
            }
        return stats
    
    def reset_learned_patterns(self):
        """Reset all learned patterns (for testing or cleanup)"""
        self.learned_patterns = {
            NotificationCategory.WORK: {'apps': {}, 'content': {}},
            NotificationCategory.PERSONAL: {'apps': {}, 'content': {}},
            NotificationCategory.JUNK: {'apps': {}, 'content': {}}
        }
        
        if self.redis_client:
            try:
                for category in NotificationCategory:
                    key = f"learned_patterns:{category.value}"
                    self.redis_client.delete(key)
            except Exception as e:
                logger.warning(f"Failed to reset learned patterns: {e}")
        
        logger.info("Reset all learned patterns")