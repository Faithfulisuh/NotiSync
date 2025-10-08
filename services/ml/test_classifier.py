"""
Unit tests for the notification classifier.
"""

import pytest
import json
from datetime import datetime
from unittest.mock import Mock, patch

from classifier import (
    NotificationClassifier, 
    NotificationCategory, 
    ClassificationResult, 
    UserFeedback
)


class TestNotificationClassifier:
    """Test cases for NotificationClassifier"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.mock_redis = Mock()
        self.mock_redis.get.return_value = None
        self.classifier = NotificationClassifier(self.mock_redis)
    
    def test_work_app_classification(self):
        """Test classification of work-related apps"""
        result = self.classifier.classify("Slack", "New message from team", "Meeting in 10 minutes")
        
        assert result.category == NotificationCategory.WORK
        assert result.confidence > 0.7
        assert "slack" in result.reasoning.lower()
        assert any("app:slack" in match for match in result.matched_keywords)
    
    def test_personal_app_classification(self):
        """Test classification of personal apps"""
        result = self.classifier.classify("WhatsApp", "Message from Mom", "How are you doing?")
        
        assert result.category == NotificationCategory.PERSONAL
        assert result.confidence > 0.7
        assert "whatsapp" in result.reasoning.lower()
    
    def test_junk_promotional_classification(self):
        """Test classification of promotional/junk notifications"""
        result = self.classifier.classify("Shopping App", "50% OFF Sale!", "Limited time offer - buy now!")
        
        assert result.category == NotificationCategory.JUNK
        assert result.confidence > 0.7
        assert any("sale" in match.lower() or "off" in match.lower() for match in result.matched_keywords)
    
    def test_work_content_keywords(self):
        """Test work classification based on content keywords"""
        result = self.classifier.classify("Unknown App", "Meeting reminder", "Quarterly review meeting at 3 PM")
        
        assert result.category == NotificationCategory.WORK
        assert "meeting" in result.reasoning.lower()
    
    def test_personal_content_keywords(self):
        """Test personal classification based on content keywords"""
        result = self.classifier.classify("Unknown App", "Birthday party", "Don't forget about Sarah's birthday party tonight!")
        
        assert result.category == NotificationCategory.PERSONAL
        assert "birthday" in result.reasoning.lower()
    
    def test_junk_pattern_matching(self):
        """Test junk classification using regex patterns"""
        test_cases = [
            ("Store App", "25% off everything!", ""),
            ("Marketing", "Free shipping today only", ""),
            ("Deals", "Buy 1 get 1 free", ""),
            ("Promo", "Limited time offer", ""),
            ("Ad", "Click here to claim your prize", "")
        ]
        
        for app_name, title, body in test_cases:
            result = self.classifier.classify(app_name, title, body)
            assert result.category == NotificationCategory.JUNK, f"Failed for: {title}"
    
    def test_otp_detection(self):
        """Test that OTP notifications are not misclassified as junk"""
        result = self.classifier.classify("Banking App", "Your OTP is 123456", "Use this code to login")
        
        # OTP should be classified as Personal (not Junk) unless there are work keywords
        assert result.category in [NotificationCategory.PERSONAL, NotificationCategory.WORK]
        assert result.category != NotificationCategory.JUNK
    
    def test_empty_content_classification(self):
        """Test classification with minimal content"""
        result = self.classifier.classify("Unknown App", "", "")
        
        assert result.category == NotificationCategory.PERSONAL
        assert result.confidence == 0.5
        assert "no specific patterns" in result.reasoning.lower()
    
    def test_case_insensitive_matching(self):
        """Test that keyword matching is case insensitive"""
        result1 = self.classifier.classify("SLACK", "MEETING REMINDER", "URGENT PROJECT UPDATE")
        result2 = self.classifier.classify("slack", "meeting reminder", "urgent project update")
        
        assert result1.category == result2.category == NotificationCategory.WORK
        assert abs(result1.confidence - result2.confidence) < 0.1
    
    def test_multiple_category_scoring(self):
        """Test that the highest scoring category wins"""
        # This should be work due to multiple work keywords
        result = self.classifier.classify("Email", "Meeting with client", "Urgent project deadline discussion")
        
        assert result.category == NotificationCategory.WORK
        assert result.confidence > 0.6
    
    def test_confidence_calculation(self):
        """Test confidence calculation based on score differences"""
        # Strong work signal
        strong_result = self.classifier.classify("Slack", "Team meeting", "Project deadline urgent")
        
        # Weak signal
        weak_result = self.classifier.classify("Unknown", "Hi", "Hello")
        
        assert strong_result.confidence > weak_result.confidence
        assert strong_result.confidence > 0.7
        assert weak_result.confidence <= 0.6


class TestLearningCapabilities:
    """Test cases for learning from user feedback"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.mock_redis = Mock()
        self.mock_redis.get.return_value = None
        self.mock_redis.setex.return_value = True
        self.classifier = NotificationClassifier(self.mock_redis)
    
    def test_learn_from_app_feedback(self):
        """Test learning from app-based feedback"""
        # Initial classification
        result1 = self.classifier.classify("CustomApp", "Test message", "")
        initial_category = result1.category
        
        # Provide feedback for different category
        target_category = NotificationCategory.WORK if initial_category != NotificationCategory.WORK else NotificationCategory.PERSONAL
        
        feedback = UserFeedback(
            app_name="CustomApp",
            title="Test message",
            body="",
            predicted_category=initial_category,
            actual_category=target_category,
            timestamp=datetime.now()
        )
        
        self.classifier.learn_from_feedback(feedback)
        
        # Check that patterns were updated
        assert target_category in self.classifier.learned_patterns
        assert "customapp" in self.classifier.learned_patterns[target_category].get('apps', {})
    
    def test_learn_from_content_feedback(self):
        """Test learning from content-based feedback"""
        feedback = UserFeedback(
            app_name="TestApp",
            title="Special keyword notification",
            body="This contains a unique pattern",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        self.classifier.learn_from_feedback(feedback)
        
        # Check that content patterns were learned
        work_patterns = self.classifier.learned_patterns[NotificationCategory.WORK]
        assert 'content' in work_patterns
        assert len(work_patterns['content']) > 0
    
    def test_learned_pattern_priority(self):
        """Test that learned patterns take priority over default keywords"""
        # Learn that "TestApp" should be Work
        feedback = UserFeedback(
            app_name="TestApp",
            title="Test",
            body="",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        # Simulate multiple feedback instances to build confidence
        for _ in range(5):
            self.classifier.learn_from_feedback(feedback)
        
        # Now classify with the learned app
        result = self.classifier.classify("TestApp", "Random message", "")
        
        assert result.category == NotificationCategory.WORK
        assert "learned from user feedback" in result.reasoning.lower()
    
    def test_confidence_building(self):
        """Test that confidence builds with repeated feedback"""
        app_name = "LearningApp"
        
        # Get initial confidence (should be low/default)
        initial_patterns = self.classifier.learned_patterns[NotificationCategory.WORK].get('apps', {})
        initial_confidence = initial_patterns.get(app_name.lower(), 0.5)
        
        # Provide feedback
        feedback = UserFeedback(
            app_name=app_name,
            title="Test",
            body="",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        self.classifier.learn_from_feedback(feedback)
        
        # Check that confidence increased
        updated_patterns = self.classifier.learned_patterns[NotificationCategory.WORK].get('apps', {})
        updated_confidence = updated_patterns.get(app_name.lower(), 0.5)
        
        assert updated_confidence > initial_confidence
    
    def test_redis_pattern_persistence(self):
        """Test that learned patterns are saved to Redis"""
        feedback = UserFeedback(
            app_name="PersistentApp",
            title="Test",
            body="",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        self.classifier.learn_from_feedback(feedback)
        
        # Verify Redis was called to save patterns
        self.mock_redis.setex.assert_called()
        
        # Check that the call included the learned pattern
        call_args = self.mock_redis.setex.call_args_list
        assert any("learned_patterns:Work" in str(call) for call in call_args)


class TestStatisticsAndUtilities:
    """Test cases for statistics and utility functions"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.mock_redis = Mock()
        self.mock_redis.get.return_value = None
        self.classifier = NotificationClassifier(self.mock_redis)
    
    def test_get_category_stats(self):
        """Test category statistics retrieval"""
        # Add some learned patterns
        self.classifier.learned_patterns[NotificationCategory.WORK]['apps'] = {
            'slack': 0.9,
            'teams': 0.8
        }
        self.classifier.learned_patterns[NotificationCategory.WORK]['content'] = {
            'meeting': 0.7,
            'project': 0.6
        }
        
        stats = self.classifier.get_category_stats()
        
        assert 'Work' in stats
        assert stats['Work']['learned_apps'] == 2
        assert stats['Work']['learned_content_patterns'] == 2
        assert len(stats['Work']['top_apps']) <= 5
        assert len(stats['Work']['top_content_patterns']) <= 10
    
    def test_reset_learned_patterns(self):
        """Test resetting learned patterns"""
        # Add some patterns
        self.classifier.learned_patterns[NotificationCategory.WORK]['apps'] = {'test': 0.8}
        
        # Reset
        self.classifier.reset_learned_patterns()
        
        # Verify patterns are cleared
        for category in NotificationCategory:
            assert len(self.classifier.learned_patterns[category]) == 0
        
        # Verify Redis delete was called
        self.mock_redis.delete.assert_called()
    
    def test_reasoning_generation(self):
        """Test that reasoning messages are informative"""
        result = self.classifier.classify("Slack", "Meeting reminder", "Team standup at 9 AM")
        
        assert result.reasoning
        assert "slack" in result.reasoning.lower() or "meeting" in result.reasoning.lower()
        assert result.category.value in result.reasoning
    
    def test_matched_keywords_tracking(self):
        """Test that matched keywords are properly tracked"""
        result = self.classifier.classify("Slack", "Meeting with client", "Project deadline")
        
        assert result.matched_keywords
        assert any("slack" in match.lower() for match in result.matched_keywords)
        assert any("meeting" in match.lower() for match in result.matched_keywords)


class TestEdgeCases:
    """Test cases for edge cases and error conditions"""
    
    def setup_method(self):
        """Set up test fixtures"""
        self.mock_redis = Mock()
        self.mock_redis.get.return_value = None
        self.classifier = NotificationClassifier(self.mock_redis)
    
    def test_none_inputs(self):
        """Test handling of None inputs"""
        result = self.classifier.classify("TestApp", None, None)
        
        assert result.category in NotificationCategory
        assert 0 <= result.confidence <= 1
        assert result.reasoning
    
    def test_empty_string_inputs(self):
        """Test handling of empty string inputs"""
        result = self.classifier.classify("", "", "")
        
        assert result.category == NotificationCategory.PERSONAL
        assert result.confidence == 0.5
    
    def test_very_long_content(self):
        """Test handling of very long content"""
        long_content = "word " * 1000  # 1000 words
        
        result = self.classifier.classify("TestApp", long_content, long_content)
        
        assert result.category in NotificationCategory
        assert 0 <= result.confidence <= 1
    
    def test_special_characters(self):
        """Test handling of special characters and unicode"""
        result = self.classifier.classify(
            "TestApp", 
            "Special chars: !@#$%^&*()", 
            "Unicode: 🎉 emoji and ñoñó characters"
        )
        
        assert result.category in NotificationCategory
        assert 0 <= result.confidence <= 1
    
    def test_redis_connection_failure(self):
        """Test behavior when Redis is unavailable"""
        # Create classifier without Redis
        classifier_no_redis = NotificationClassifier(None)
        
        result = classifier_no_redis.classify("Slack", "Meeting", "")
        
        assert result.category == NotificationCategory.WORK
        assert result.confidence > 0
        
        # Learning should not crash
        feedback = UserFeedback(
            app_name="TestApp",
            title="Test",
            body="",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        # Should not raise exception
        classifier_no_redis.learn_from_feedback(feedback)
    
    def test_redis_error_handling(self):
        """Test handling of Redis errors"""
        self.mock_redis.get.side_effect = Exception("Redis error")
        self.mock_redis.setex.side_effect = Exception("Redis error")
        
        # Should not crash on initialization
        classifier = NotificationClassifier(self.mock_redis)
        
        # Should not crash on classification
        result = classifier.classify("Slack", "Meeting", "")
        assert result.category in NotificationCategory
        
        # Should not crash on learning
        feedback = UserFeedback(
            app_name="TestApp",
            title="Test",
            body="",
            predicted_category=NotificationCategory.PERSONAL,
            actual_category=NotificationCategory.WORK,
            timestamp=datetime.now()
        )
        
        classifier.learn_from_feedback(feedback)  # Should not raise


if __name__ == "__main__":
    pytest.main([__file__, "-v"])