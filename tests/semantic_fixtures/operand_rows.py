"""Uneven local dependencies; no whole-model identity is used for drawing."""
import torch
from torch import nn


class StaggeredOperands(nn.Module):
    def forward(self, left, middle, right):
        a = torch.sin(left)
        b = torch.tanh(torch.cos(middle))
        c = torch.relu(right)
        return torch.cat((a, b, c), dim=-1)


class RenamedOperands(nn.Module):
    def forward(self, first, second, third):
        alpha = torch.sin(first)
        beta = torch.tanh(torch.cos(second))
        gamma = torch.relu(third)
        return torch.cat((alpha, beta, gamma), dim=-1)


class InterruptedOperands(nn.Module):
    def fragment(self, x):
        return external_unresolved(torch.cos(x))

    def forward(self, left, middle, right):
        a = torch.sin(left)
        b = self.fragment(middle)
        c = torch.tanh(torch.relu(right))
        return torch.cat((a, b, c), dim=-1)


class ConditionalOperands(nn.Module):
    def forward(self, left, middle, right, choose):
        a = torch.sin(left)
        b = torch.tanh(torch.cos(middle))
        if choose:
            return torch.cat((a, b, torch.relu(right)), dim=-1)
        return a


class EscapingOperands(nn.Module):
    def forward(self, left, middle, right):
        a = torch.sin(left)
        b = torch.tanh(torch.cos(middle))
        c = torch.relu(right)
        return torch.cat((a, b, c), dim=-1), a


class StatefulOperands(nn.Module):
    def forward(self, left, middle, right):
        a = left.add_(right)
        b = torch.tanh(torch.cos(middle))
        c = torch.relu(right)
        return torch.cat((a, b, c), dim=-1)
