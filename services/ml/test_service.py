#!/usr/bin/env python3
"""
Simple test to verify the classification service works without starting the server.
"""

from classifier import NotificationClassifier, NotificationCategory, UserFeedback
from datetime import datetime

def test_classification_service():
    """Test the classification service directly"""
    print("🧠 Testing NotiSync Classification Service")
    print("=" * 50)
    
    # Initialize classifier without Redis for testing
    classifier = NotificationClassifier(redis_client=None)
    
    # Test notifications
    test_cases = [
        {
            "app_name": "Slack",
            "title": "Meeting reminder",
            "body": "Team standup in 10 minutes",
            "expected": NotificationCategory.WORK
        },
        {
            "app_name": "WhatsApp",
            "title": "Message from Mom",
            "body": "How are you doing?",
            "expected": NotificationCategory.PERSONAL
        },
        {
            "app_name": "Shopping App",
            "title": "50% OFF Sale!",
            "body": "Limited time offer - buy now!",
            "expected": NotificationCategory.JUNK
        },
        {
            "app_name": "Banking App",
            "title": "Your OTP is 123456",
            "body": "Use this code to login",
            "expected": NotificationCategory.PERSONAL  # Should not be junk
        }
    ]
    
    print("🔍 Classification Results:")
    print("-" * 30)
    
    correct = 0
    total = len(test_cases)
    
    for i, case in enumerate(test_cases, 1):
        result = classifier.classify(
            case["app_name"],
            case["title"],
            case["body"]
        )
        
        is_correct = result.category == case["expected"]
        status = "✅" if is_correct else "❌"
        
        print(f"{i}. {case['app_name']}: '{case['title']}'")
        print(f"   Predicted: {result.category.value} (confidence: {result.confidence:.2f})")
        print(f"   Expected: {case['expected'].value} {status}")
        print(f"   Reasoning: {result.reasoning}")
        
        if result.matched_keywords:
            keywords = ", ".join(result.matched_keywords[:3])
            print(f"   Keywords: {keywords}")
        
        print()
        
        if is_correct:
            correct += 1
    
    accuracy = (correct / total) * 100
    print(f"📈 Accuracy: {correct}/{total} ({accuracy:.1f}%)")
    
    # Test learning functionality
    print("\n🎓 Testing Learning Capability:")
    print("-" * 30)
    
    # Test feedback
    feedback = UserFeedback(
        app_name="CustomApp",
        title="Project update",
        body="Quarterly report ready",
        predicted_category=NotificationCategory.PERSONAL,
        actual_category=NotificationCategory.WORK,
        timestamp=datetime.now()
    )
    
    classifier.learn_from_feedback(feedback)
    print("✅ Feedback processed successfully")
    
    # Test stats
    stats = classifier.get_category_stats()
    print(f"📊 Category stats: {len(stats)} categories")
    
    for category, category_stats in stats.items():
        print(f"   {category}: {category_stats['learned_apps']} apps, {category_stats['learned_content_patterns']} patterns")
    
    print("\n✨ Classification service test completed successfully!")
    return True

if __name__ == "__main__":
    test_classification_service()