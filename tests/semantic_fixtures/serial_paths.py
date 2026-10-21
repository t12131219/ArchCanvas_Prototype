"""Long source paths, distinct configurations, and important escape boundaries."""
import torch
from torch import nn


def curve(x):
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.tanh(x)
    x = torch.tanh(x)
    x = torch.tanh(x)
    x = torch.nan_to_num(x, nan=0.0)
    x = torch.nan_to_num(x, nan=1.0)
    return torch.cos(x)


def escaped_curve(x):
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    saved = torch.sin(x)
    x = torch.sin(saved)
    x = torch.sin(x)
    x = torch.sin(x)
    return saved, torch.cos(x)


def late_curve(x, context):
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    x = torch.sin(x)
    return torch.cos(x + context)


class LongCurve(nn.Module):
    def forward(self, x):
        return torch.relu(curve(x))


class MixedCurve(nn.Module):
    def forward(self, x):
        known = curve(x)
        other = foreign_step(x)
        return torch.cat((known, other), dim=-1)


class EscapingCurve(nn.Module):
    def forward(self, x):
        saved, final = escaped_curve(x)
        return saved * final


class LateCurve(nn.Module):
    def forward(self, x, context):
        return torch.relu(late_curve(x, context))


class StatefulCurve(nn.Module):
    def __init__(self):
        super().__init__()
        self.register_buffer('counter', torch.zeros(1))

    def forward(self, x):
        known = curve(x)
        self.counter.add_(1)
        return known + self.counter


def wrapped_curve(x):
    return torch.cos(curve(x))


class RefactoredCurve(nn.Module):
    def forward(self, x):
        return torch.relu(wrapped_curve(x))


def varied_curve(x):
    x = torch.sin(x)
    x = torch.cos(x)
    x = torch.tanh(x)
    x = torch.sigmoid(x)
    x = torch.sin(x)
    x = torch.cos(x)
    x = torch.tanh(x)
    return torch.sigmoid(x)


class VariedCurve(nn.Module):
    def forward(self, x):
        return torch.relu(varied_curve(x))
